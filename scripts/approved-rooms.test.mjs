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
    if (name === 'auth') exports = { requireAuth: async () => ({ role: 'admin' }) }
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
  const response = { status() { return this }, json(value) { result = value; return this } }
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
