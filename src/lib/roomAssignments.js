import data from './data/roomAssignments.json'
import { approvedRoomKey, approvedRooms } from './approvedRooms.js'
import RoomAssignment from './models/RoomAssignment.js'
import RoomAssignmentSnapshot from './models/RoomAssignmentSnapshot.js'

export const assignmentSource = data.source
const bundledRecords = new Map(data.rooms.map(room => [room.room_no, room]))
const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const compact = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '')
const identity = value => compact(value).replace(/[^A-Z0-9]/g, '') || compact(value)

const mergeText = (left, right) => {
  const values = [...new Set([left, right].flatMap(value => String(value || '').split(' / '))
    .map(value => value.trim()).filter(Boolean))]
  return values.join(' / ') || null
}

function mergeUploadedRecords(docs) {
  const merged = new Map()
  const byIdentity = new Map()
  for (const source of docs) {
    const key = identity(source.room_no)
    let record = byIdentity.get(key)
    if (!record) {
      record = {
        ...source,
        day_assignments: { ...source.day_assignments },
        aliases: [source.room_no, source.source_name].filter(Boolean),
      }
      byIdentity.set(key, record)
      merged.set(record.room_no, record)
      continue
    }
    record.aliases.push(source.room_no, source.source_name)
    record.aliases = [...new Set(record.aliases.filter(Boolean))]
    record.block ||= source.block || null
    record.floor ??= source.floor ?? null
    record.capacity ??= source.capacity ?? null
    record.room_type ||= source.room_type || null
    record.assigned = mergeText(record.assigned, source.assigned)
    for (const day of days)
      record.day_assignments[day] = mergeText(record.day_assignments[day], source.day_assignments?.[day])
  }
  return merged
}

export async function getRoomAssignmentDataset() {
  const snapshot = await RoomAssignmentSnapshot.findOne({ key: 'active' }).lean()
  if (!snapshot) return { records: bundledRecords, source: assignmentSource, uploaded: false, snapshot: null }
  const docs = await RoomAssignment.find({ dataset: snapshot.dataset }).lean()
  return { records: mergeUploadedRecords(docs), source: snapshot.filename,
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
    aliases: room.aliases || [],
  }))
}

const SECTION_SUFFIX = /-(MA|AB|CD|[A-F])$/i
const resolverCache = new WeakMap()

export function createRoomInventoryResolver(inventory) {
  const aliases = new Map()
  for (const room of inventory) {
    aliases.set(compact(room.room_no), room.room_no)
    aliases.set(compact(room.source_name), room.room_no)
    for (const alias of room.aliases || []) aliases.set(compact(alias), room.room_no)
  }
  const looseAliases = new Map()
  const collisions = new Set()
  for (const [alias, room] of aliases) {
    const key = identity(alias)
    if (looseAliases.has(key) && looseAliases.get(key) !== room) collisions.add(key)
    else looseAliases.set(key, room)
  }
  for (const key of collisions) looseAliases.delete(key)
  return raw => {
    let value = compact(raw)
    if (!value) return ''
    if (aliases.has(value)) return aliases.get(value)
    const original = value
    while (SECTION_SUFFIX.test(value)) {
      value = value.replace(SECTION_SUFFIX, '')
      if (aliases.has(value)) return aliases.get(value)
      if (looseAliases.has(identity(value))) return looseAliases.get(identity(value))
    }
    return looseAliases.get(identity(original)) || ''
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
