import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Load the actual API modules with database/auth fixtures; no live DB is touched.
async function load(relative, overrides = {}) {
  const cache = new Map()
  function moduleFor(file) {
    if (cache.has(file)) return cache.get(file)
    const name = path.basename(file, '.js')
    let exports = overrides[name]
    if (name === 'auth' && !exports) exports = { requireAuth: async () => ({ role: 'admin' }) }
    if (name === 'mongodb') exports = { connectDB: async () => {} }
    if (name === 'RoomAssignmentSnapshot' && !exports) exports = {
      default: { findOne: () => ({ lean: async () => null }) },
    }
    if (name === 'RoomAssignment' && !exports) exports = {
      default: { find: () => ({ lean: async () => [] }) },
    }
    if (file.endsWith('.json')) exports = { default: JSON.parse(readFileSync(file, 'utf8')) }
    const mod = exports
      ? new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      }, { identifier: file })
      : new vm.SourceTextModule(readFileSync(file, 'utf8'), { identifier: file })
    cache.set(file, mod)
    return mod
  }
  const mod = moduleFor(path.resolve(relative))
  await mod.link((specifier, parent) => {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
      const identifier = `external:${specifier}`
      if (cache.has(identifier)) return cache.get(identifier)
      const value = require(specifier)
      const names = [...new Set(['default', ...Object.keys(value)])]
      const external = new vm.SyntheticModule(names, function () {
        this.setExport('default', value)
        for (const name of names.slice(1)) this.setExport(name, value[name])
      }, { identifier })
      cache.set(identifier, external)
      return external
    }
    let target = specifier.startsWith('@/')
      ? path.resolve('src', specifier.slice(2))
      : path.resolve(path.dirname(parent.identifier), specifier)
    if (!existsSync(target)) target += '.js'
    return moduleFor(target)
  })
  await mod.evaluate()
  return mod.namespace
}

const model = rows => ({ default: { find: () => ({ lean: async () => rows }) } })
const snapshot = { default: { findOne: () => ({ lean: async () => ({ snapshotId: 'fixture' }) }) } }
async function request(handler, query) {
  let result
  const response = { setHeader() {}, status() { return this }, json(value) { result = value; return this } }
  await handler({ method: 'GET', query }, response)
  return result
}

test('all 311 workbook rooms resolve uniquely, including labels and sections', async () => {
  const { approvedRooms, approvedRoomKey, isApprovedRoom } = await load('src/lib/approvedRooms.js')
  assert.equal(approvedRooms.length, 311)
  assert.equal(new Set(approvedRooms.map(r => r.room_no)).size, 311)
  for (const room of approvedRooms) {
    assert.equal(approvedRoomKey(room.source_name), room.room_no)
    assert.equal(approvedRoomKey(room.room_no + '-MA'), room.room_no)
    assert.ok(room.capacity > 0)
  }
  assert.equal(approvedRoomKey(' c421 b1-A '), 'C421B1')
  assert.equal(approvedRoomKey('M214 CAD LAB-MA'), 'M214')
  assert.equal(approvedRoomKey(' SK008 '), 'SK008')
  for (const room of ['UNWANTED', 'SPORTS', 'C999', '', null]) assert.equal(isApprovedRoom(room), false)
})

test('free rooms exclude unapproved rooms and remain busy if any section is occupied', async () => {
  const { default: handler } = await load('src/pages/api/free/rooms.js', {
    RoomwiseSnapshot: snapshot,
    RoomwiseEntry: { default: { distinct: async (_, query) => query.day
      ? ['C007-B', 'C421B1-MA']
      : ['C007-A', 'C007-B', 'C008-MA', 'C421 B1-A', 'C421B1-MA', 'UNWANTED-A'] } },
    RoomMeta: model([{ room_no: 'C008', capacity: 999, room_type: 'OLD' }]),
    ErpRoomData: model([]),
  })
  const result = await request(handler, { day: '1', periods: '3,4' })
  assert.deepEqual(result.rooms.map(r => r.number), ['C008'])
  assert.equal(result.count, 1)
  assert.equal(result.rooms[0].capacity, 72)
  assert.equal(result.rooms[0].type, 'CR')
})

test('statistics omit unwanted rooms and merge whitespace variants', async () => {
  const { default: handler } = await load('src/pages/api/free/room-stats.js', {
    RoomwiseSnapshot: snapshot,
    RoomwiseEntry: { default: {
      find: () => ({ lean: async () => [
        { room_no: 'C421 B1-A', day: 1, hour: 1 },
        { room_no: 'C421B1-MA', day: 1, hour: 1 },
        { room_no: 'UNWANTED', day: 1, hour: 1 },
      ] }),
      distinct: async () => ['C421 B1-A', 'C421B1-MA', 'UNWANTED'],
    } },
    RoomMeta: model([]), ErpRoomData: model([]),
  })
  const result = await request(handler, {})
  assert.equal(result.stats.length, 1)
  assert.equal(result.stats[0].number, 'C421B1')
  assert.equal(result.stats[0].totalBusy, 1)
})

test('summary master restricts uploads and uses final workbook capacity', async () => {
  const { buildRoomMaster } = await load('src/lib/roomMaster.js', {
    RoomMeta: model([
      { room_no: 'C007', alloted_to: 'COE', capacity: 999 },
      { room_no: 'UNWANTED', alloted_to: 'COE', capacity: 80 },
    ]),
    RoomAllocation: model([
      { roomNo: 'C007', coeMhs: 'COE', capacity: 555 },
      { roomNo: 'C008', coeMhs: 'MHS', capacity: null },
    ]),
  })
  const { room } = await buildRoomMaster([1])
  assert.deepEqual([...room.keys()], ['C007', 'C008'])
  assert.equal(room.get('C007').capacity, 72)
  assert.equal(room.get('C008').capacity, 72)
})

test('room picker contains only the final inventory, despite extra ERP records', async () => {
  const { default: handler } = await load('src/pages/api/free/room-list.js', {
    RoomMeta: model([{ room_no: 'UNWANTED' }]),
    ErpRoomData: model([{ room_no: 'UNWANTED', erp_id: 1 }, { room_no: 'C007', erp_id: 2 }]),
  })
  const result = await request(handler, {})
  assert.equal(result.rooms.length, 311)
  assert.ok(!result.rooms.some(r => r.room === 'UNWANTED'))
  assert.equal(result.rooms.find(r => r.room === 'C007').erp_id, 2)
})

test('live availability resolves numeric ERP IDs before excluding occupied rooms', async () => {
  const { default: handler } = await load('src/pages/api/free/live-rooms.js', {
    TimetableSnapshot: snapshot,
    TimetableEntry: { default: {
      distinct: async (_, query) => query.umatdayid
        ? ['1234'] : ['1234', 'C007-A', 'C008-MA', 'UNWANTED'],
      aggregate: async () => [],
    } },
    RoomMeta: model([]),
    ErpRoomData: model([{ room_no: 'C007-MA', sections: [{ erp_id: 1234 }] }]),
  })
  const result = await request(handler, { day: '1', periods: '1' })
  assert.deepEqual(result.rooms.map(r => r.number), ['C008'])
  assert.equal(result.count, 1)
})

test('block utilization counts physical rooms once, uses approved blocks and covers exactly 66 slots', async () => {
  const { buildBlockUtilization } = await load('src/lib/blockUtilization.js')
  const result = buildBlockUtilization([
    { room_no: 'C007-A', day: 1, hour: 1 },
    { room_no: 'C007-MA', day: 1, hour: 1 },
    { room_no: 'C007-B', day: 6, hour: 11 },
    { room_no: 'C008', day: 1, hour: 12 },
    { room_no: 'C008', day: 7, hour: 1 },
    { room_no: 'C008', day: 0, hour: 1 },
    { room_no: 'C008', day: 1, hour: 0 },
    { room_no: 'C008', day: 1, hour: 1.5 },
    { room_no: 'UNWANTED', day: 1, hour: 1 },
  ], ['C007-A', 'C007-MA', 'C008', 'UNWANTED'])
  const block = result.blocks.find(item => item.block === 'C')
  assert.equal(block.coveredRooms, 2)
  assert.equal(block.days.length, 6)
  assert.ok(block.days.every(day => day.periods.length === 11))
  assert.equal(block.days[0].periods[0].occupied, 1)
  assert.equal(block.days[0].periods[0].free, 1)
  assert.equal(block.days[0].periods[0].utilization, 50)
  assert.deepEqual(block.days[0].periods[0].occupiedRooms, ['C007'])
  assert.deepEqual(block.days[0].periods[0].freeRooms, ['C008'])
  assert.equal(block.days[5].periods[10].occupied, 1)
  assert.equal(block.occupiedSlots, 2)
  assert.equal(block.totalSlots, 132)
  assert.equal(block.utilization, 1.5)
  assert.equal(result.totals.roomCount, 311)
  assert.equal(result.totals.coveredRooms, 2)
  assert.equal(result.totals.missingRooms, 309)
  for (const group of result.blocks) for (const day of group.days) for (const slot of day.periods) {
    assert.equal(slot.occupied + slot.free, group.coveredRooms)
    assert.ok(slot.utilization == null || (slot.utilization >= 0 && slot.utilization <= 100))
  }
})

test('block utilization distinguishes missing timetable data from a genuinely empty slot', async () => {
  const { buildBlockUtilization } = await load('src/lib/blockUtilization.js')
  const empty = buildBlockUtilization([], [])
  assert.equal(empty.totals.utilization, null)
  assert.equal(empty.totals.freeSlots, 0)
  assert.ok(empty.blocks.every(block => block.days.every(day => day.periods.every(slot => slot.free === 0 && slot.utilization === null))))
  const covered = buildBlockUtilization([], ['M214 CAD LAB-MA'])
  const block = covered.blocks.find(item => item.block === 'Mech')
  assert.equal(block.coveredRooms, 1)
  assert.equal(block.utilization, 0)
  assert.equal(block.freeSlots, 66)
  assert.deepEqual(block.days[0].periods[0].freeRooms, ['M214'])
})

test('block API reads only the active snapshot and periods 1–11, with source details', async () => {
  let query, distinctQuery
  const { default: handler } = await load('src/pages/api/free/block-utilization.js', {
    RoomwiseSnapshot: { default: { findOne: () => ({ lean: async () => ({
      snapshotId: 'active-roomwise', label: 'ERP September', filename: 'Roomwise.csv',
    }) }) } },
    RoomwiseEntry: { default: {
      find: filter => { query = filter; return { lean: async () => [{ room_no: 'C007', day: 1, hour: 1 }] } },
      distinct: async (_, filter) => { distinctQuery = filter; return ['C007', 'C008'] },
    } },
  })
  const result = await request(handler, {})
  assert.equal(result.success, true)
  assert.equal(result.filename, 'Roomwise.csv')
  assert.equal(result.dataset, 'active-roomwise')
  assert.deepEqual(query, { dataset: 'active-roomwise', day: { $gte: 1, $lte: 6 }, hour: { $gte: 1, $lte: 11 } })
  assert.deepEqual(distinctQuery, { dataset: 'active-roomwise' })
  assert.equal(result.totals.occupiedSlots, 1)
  assert.equal(result.roomAssignments.C007.type, 'CR')
  assert.equal(result.roomAssignments.C007.capacity, 72)
})

test('block API returns a no-data state when no roomwise upload exists', async () => {
  const { default: handler } = await load('src/pages/api/free/block-utilization.js', {
    RoomwiseSnapshot: { default: { findOne: () => ({ lean: async () => null }) } },
    RoomwiseEntry: model([]),
  })
  const result = await request(handler, {})
  assert.equal(result.noData, true)
  assert.deepEqual(result.blocks, [])
})

test('block API requires authentication and rejects writes', async () => {
  let readDatabase = false
  const { default: handler } = await load('src/pages/api/free/block-utilization.js', {
    auth: { requireAuth: async (_, res) => { res.status(401).json({ success: false }); return null } },
    RoomwiseSnapshot: { default: { findOne: () => { readDatabase = true; throw new Error('Unexpected DB read') } } },
    RoomwiseEntry: model([]),
  })
  let status
  const res = { status(code) { status = code; return this }, json() {} }
  await handler({ method: 'GET', query: {} }, res)
  assert.equal(status, 401)
  assert.equal(readDatabase, false)
  await handler({ method: 'POST', query: {} }, res)
  assert.equal(status, 405)
})

test('assignment workbook supplies daily allocations without expanding approved rooms', async () => {
  const { roomAssignment } = await load('src/lib/roomAssignments.js')
  const monday = roomAssignment('C007-A', 1)
  const thursday = roomAssignment('C007', 4)
  assert.equal(monday.assigned, 'CLASS')
  assert.equal(monday.assigned_for_day, 'II PBL')
  assert.equal(thursday.assigned_for_day, 'I PBL')
  assert.equal(thursday.assignment_day, 4)
  assert.equal(roomAssignment('C007', 6).assigned_for_day, 'II PBL')
  assert.equal(roomAssignment('C007', 7).assigned_for_day, null)
  assert.equal(roomAssignment('C124', 1).has_assignment_data, false)
  assert.equal(roomAssignment('UNWANTED', 1).assigned, null)
  assert.equal(roomAssignment('C322 B', 1).assigned_for_day, 'CLASS')
})

test('assignment importer combines duplicate rows but does not guess physical room names', () => {
  const { importAssignments } = require('./import-room-assignments.cjs')
  const result = importAssignments([
    { 'ROOM NO': 'C007', ASSIGNED: 'CLASS', MON: 'II PBL', THU: '' },
    { 'ROOM NO': ' c007 ', ASSIGNED: 'CLASS', MON: 'II PBL', THU: 'I PBL' },
    { 'ROOM NO': 'C007', ASSIGNED: 'CRT', MON: 'CRT' },
    { 'ROOM NO': 'C124A', ASSIGNED: 'CLASS', MON: 'Do not guess C124' },
    { 'ROOM NO': 'CRICKET NETS', ASSIGNED: 'SPORTS', MON: 'SPORTS' },
  ])
  assert.equal(result.rooms.length, 1)
  assert.equal(result.rooms[0].assigned, 'CLASS / CRT')
  assert.equal(result.rooms[0].day_assignments.mon, 'II PBL / CRT')
  assert.equal(result.rooms[0].day_assignments.thu, 'I PBL')
  assert.ok(result.unmatchedRooms.includes('C124A'))
})

test('weekly assignment API contains 311 approved rooms, including 24 unmatched records', async () => {
  const { default: handler } = await load('src/pages/api/free/room-assignments.js')
  const result = await request(handler, {})
  assert.equal(result.rooms.length, 311)
  assert.equal(result.rooms.filter(room => room.has_assignment_data).length, 287)
  assert.equal(result.rooms.filter(room => !room.has_assignment_data).length, 24)
  assert.ok(!result.rooms.some(room => room.number === 'CRICKET NETS'))
  assert.equal(result.rooms.find(room => room.number === 'C007').day_assignments.thu, 'I PBL')
  assert.equal(result.rooms.find(room => room.number === 'C008').capacity, 72)
})

test('free-room API includes the requested day assignment without changing occupancy', async () => {
  const { default: handler } = await load('src/pages/api/free/rooms.js', {
    RoomwiseSnapshot: snapshot,
    RoomwiseEntry: { default: { distinct: async (_, query) => query.day ? [] : ['C007-A'] } },
    RoomMeta: model([]), ErpRoomData: model([]),
  })
  const monday = await request(handler, { day: '1', periods: '1' })
  const thursday = await request(handler, { day: '4', periods: '1' })
  assert.equal(monday.count, 1)
  assert.equal(thursday.count, 1)
  assert.equal(monday.rooms[0].assigned_for_day, 'II PBL')
  assert.equal(thursday.rooms[0].assigned_for_day, 'I PBL')
  assert.equal(thursday.rooms[0].assigned, 'CLASS')
})

test('uploaded assignment dataset overrides bundled data immediately', async () => {
  const snapshot = { dataset: 'uploaded-1', filename: 'latest.xlsx', uploadedAt: new Date('2026-09-25') }
  const { getRoomAssignmentDataset, roomAssignment } = await load('src/lib/roomAssignments.js', {
    RoomAssignmentSnapshot: { default: { findOne: () => ({ lean: async () => snapshot }) } },
    RoomAssignment: { default: { find: () => ({ lean: async () => [{
      room_no: 'C007', assigned: 'NEW DEPARTMENT',
      day_assignments: { mon: 'NEW MONDAY', tue: null, wed: null, thu: null, fri: null, sat: null },
    }] }) } },
  })
  const data = await getRoomAssignmentDataset()
  assert.equal(data.uploaded, true)
  assert.equal(data.source, 'latest.xlsx')
  assert.equal(roomAssignment('C007-A', 1, data.records).assigned, 'NEW DEPARTMENT')
  assert.equal(roomAssignment('C007-A', 1, data.records).assigned_for_day, 'NEW MONDAY')
  assert.equal(roomAssignment('C008', 1, data.records).has_assignment_data, false)
})

test('admin assignment parser makes every workbook room final and merges duplicates', async () => {
  const XLSX = require('xlsx')
  const { ASSIGNMENT_COLUMNS, parseRoomAssignmentBuffer } = await load('src/lib/roomAssignmentParser.js')
  assert.deepEqual([...ASSIGNMENT_COLUMNS], [
    'FLOOR', 'ROOM NO', 'BLOCK', 'ROOM CAPACITY', 'TYPE', 'ASSIGNED',
    'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT',
  ])
  const sheet = XLSX.utils.json_to_sheet([
    { 'ROOM NO': 'C007', ASSIGNED: 'CLASS', MON: 'II PBL', TUE: '', WED: '', THU: 'I PBL', FRI: '', SAT: '' },
    { 'ROOM NO': ' c007 ', ASSIGNED: 'CRT', MON: 'CRT', TUE: '', WED: '', THU: '', FRI: '', SAT: '' },
    { 'ROOM NO': 'CRICKET NETS', BLOCK: 'Sports', FLOOR: 0, 'ROOM CAPACITY': '40+40', TYPE: 'GROUND', ASSIGNED: 'SPORTS', MON: 'SPORTS', TUE: '', WED: '', THU: '', FRI: '', SAT: '' },
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Assignments')
  const parsed = parseRoomAssignmentBuffer(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
  assert.equal(parsed.docs.length, 2)
  assert.equal(parsed.docs[0].room_no, 'C007')
  assert.equal(parsed.docs[0].assigned, 'CLASS / CRT')
  assert.equal(parsed.docs[0].day_assignments.mon, 'II PBL / CRT')
  const sports = parsed.docs.find(room => room.room_no === 'CRICKET NETS')
  assert.equal(sports.block, 'Sports')
  assert.equal(sports.capacity, 80)
  assert.equal(sports.room_type, 'GROUND')
  assert.equal(parsed.duplicateCount, 1)

  const invalidSheet = XLSX.utils.json_to_sheet([{ 'ROOM NO': 'C007' }])
  const invalidWorkbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(invalidWorkbook, invalidSheet, 'Assignments')
  assert.throws(() => parseRoomAssignmentBuffer(XLSX.write(invalidWorkbook, { type: 'buffer', bookType: 'xlsx' })), /Missing columns/)
})

test('uploaded assignment rooms replace the fallback inventory in Free Rooms', async () => {
  const uploaded = [
    { room_no: 'C007', source_name: 'C007', block: 'C', floor: 0, capacity: 72, room_type: 'CR', assigned: 'CLASS', day_assignments: {} },
    { room_no: 'CRICKET NETS', source_name: 'CRICKET NETS', block: 'Sports', floor: 1, capacity: 100, room_type: 'GROUND', assigned: 'SPORTS', day_assignments: {} },
  ]
  const { default: handler } = await load('src/pages/api/free/rooms.js', {
    RoomAssignmentSnapshot: { default: { findOne: () => ({ lean: async () => ({ dataset: 'uploaded', filename: 'final.xlsx' }) }) } },
    RoomAssignment: { default: { find: () => ({ lean: async () => uploaded }) } },
    RoomwiseSnapshot: snapshot,
    RoomwiseEntry: { default: { distinct: async (_, query) => query.day ? ['C007-A'] : ['C007-A'] } },
    RoomMeta: model([]), ErpRoomData: model([]),
  })
  const result = await request(handler, { day: '1', periods: '1' })
  assert.deepEqual(result.rooms.map(room => room.number), ['CRICKET NETS'])
  assert.equal(result.rooms[0].block, 'Sports')
  assert.equal(result.rooms[0].type, 'GROUND')
  assert.equal(result.rooms[0].floor, 1)
  assert.equal(result.rooms[0].assigned, 'SPORTS')
})
