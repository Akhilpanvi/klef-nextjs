import data from './data/roomAssignments.json'
import { approvedRoomKey, approvedRooms } from './approvedRooms.js'
import RoomAssignment from './models/RoomAssignment.js'
import RoomAssignmentSnapshot from './models/RoomAssignmentSnapshot.js'

export const assignmentSource = data.source
const bundledRecords = new Map(data.rooms.map(room => [room.room_no, room]))
const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export async function getRoomAssignmentDataset() {
  const snapshot = await RoomAssignmentSnapshot.findOne({ key: 'active' }).lean()
  if (!snapshot) return { records: bundledRecords, source: assignmentSource, uploaded: false, snapshot: null }
  const docs = await RoomAssignment.find({ dataset: snapshot.dataset }).lean()
  return { records: new Map(docs.map(room => [room.room_no, room])), source: snapshot.filename,
    uploaded: true, snapshot }
}

export function getRoomInventory(data) {
  if (!data?.uploaded) return approvedRooms.map(room => ({ ...room }))
  return [...data.records.values()].map(room => ({
    room_no: room.room_no,
    source_name: room.source_name || room.room_no,
    block: room.block || String(room.room_no).match(/^[A-Za-z&]+/)?.[0]?.toUpperCase() || '?',
    room_type: room.room_type || '?',
    capacity: room.capacity ?? null,
    floor: room.floor ?? null,
  }))
}

const compact = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '')
const SECTION_SUFFIX = /-(MA|AB|CD|[A-F])$/i
const resolverCache = new WeakMap()

export function createRoomInventoryResolver(inventory) {
  const aliases = new Map()
  for (const room of inventory) {
    aliases.set(compact(room.room_no), room.room_no)
    aliases.set(compact(room.source_name), room.room_no)
  }
  return raw => {
    let value = compact(raw)
    if (!value) return ''
    if (aliases.has(value)) return aliases.get(value)
    while (SECTION_SUFFIX.test(value)) {
      value = value.replace(SECTION_SUFFIX, '')
      if (aliases.has(value)) return aliases.get(value)
    }
    return ''
  }
}

export function roomAssignment(raw, day, records = bundledRecords) {
  let resolver = resolverCache.get(records)
  if (!resolver) {
    resolver = createRoomInventoryResolver([...records.values()])
    resolverCache.set(records, resolver)
  }
  const record = records.get(resolver(raw) || approvedRoomKey(raw))
  const dayNumber = Number(day)
  const key = Number.isInteger(dayNumber) ? days[dayNumber - 1] : null
  return {
    assigned: record?.assigned ?? null,
    day_assignments: record?.day_assignments ?? Object.fromEntries(days.map(day => [day, null])),
    assignment_day: key ? dayNumber : null,
    assigned_for_day: key ? record?.day_assignments[key] ?? null : null,
    has_assignment_data: Boolean(record),
  }
}
