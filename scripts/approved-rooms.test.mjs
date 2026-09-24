import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Load the actual API modules with database/auth fixtures; no live DB is touched.
async function load(relative, overrides = {}) {
  const cache = new Map()
  async function moduleFor(file) {
    if (cache.has(file)) return cache.get(file)
    const name = path.basename(file, '.js')
    let exports = overrides[name]
    if (name === 'auth' && !exports) exports = { requireAuth: async () => ({ role: 'admin' }) }
    if (name === 'mongodb') exports = { connectDB: async () => {} }
    if (file.endsWith('.json')) exports = { default: JSON.parse(readFileSync(file, 'utf8')) }
    const mod = exports
      ? new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      }, { identifier: file })
      : new vm.SourceTextModule(readFileSync(file, 'utf8'), { identifier: file })
    cache.set(file, mod)
    await mod.link(async (specifier, parent) => {
      let target = specifier.startsWith('@/')
        ? path.resolve('src', specifier.slice(2))
        : path.resolve(path.dirname(parent.identifier), specifier)
      if (!existsSync(target)) target += '.js'
      return moduleFor(target)
    })
    return mod
  }
  const mod = await moduleFor(path.resolve(relative))
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
