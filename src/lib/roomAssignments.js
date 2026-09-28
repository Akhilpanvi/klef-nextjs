import data from './data/roomAssignments.json'
import { approvedRoomKey, approvedRooms } from './approvedRooms.js'
import RoomAssignment from './models/RoomAssignment.js'
import RoomAssignmentSnapshot from './models/RoomAssignmentSnapshot.js'

export const assignmentSource = data.source
const bundledRecords = new Map(data.rooms.map(room => [room.room_no, room]))
const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const compact = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '')
const normalizedRoomName = value => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ')
const looseIdentity = value => compact(value).replace(/[^A-Z0-9]/g, '') || compact(value)

const mergeText = (left, right) => {
  const values = [...new Set([left, right].flatMap(value => String(value || '').split(' / '))
    .map(value => value.trim()).filter(Boolean))]
  return values.join(' / ') || null
}

function mergeUploadedRecords(docs) {
  const merged = new Map()
  const byIdentity = new Map()
  for (const source of docs) {
    // source_name preserves what the admin uploaded. Older importer versions
    // could rewrite R105A to R105 in room_no; restore the original name here so
    // existing uploads are corrected without requiring another upload.
    const authoritativeName = normalizedRoomName(source.source_name || source.room_no)
    const normalizedSource = { ...source, room_no: authoritativeName, source_name: authoritativeName }
    const key = compact(authoritativeName)
    let record = byIdentity.get(key)
    if (!record) {
      record = {
        ...normalizedSource,
        day_assignments: { ...normalizedSource.day_assignments },
        aliases: [authoritativeName],
      }
      byIdentity.set(key, record)
      merged.set(record.room_no, record)
      continue
    }
    record.aliases.push(authoritativeName)
    record.aliases = [...new Set(record.aliases.filter(Boolean))]
    record.block ||= normalizedSource.block || null
    record.floor ??= normalizedSource.floor ?? null
    record.capacity ??= normalizedSource.capacity ?? null
    record.room_type ||= normalizedSource.room_type || null
    record.assigned = mergeText(record.assigned, normalizedSource.assigned)
    for (const day of days)
      record.day_assignments[day] = mergeText(record.day_assignments[day], normalizedSource.day_assignments?.[day])
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
    const key = looseIdentity(alias)
    if (looseAliases.has(key) && looseAliases.get(key) !== room) collisions.add(key)
    else looseAliases.set(key, room)
  }
  for (const key of collisions) looseAliases.delete(key)
  return raw => {
    let value = compact(raw)
    if (!value) return ''
    if (aliases.has(value)) return aliases.get(value)
    const original = value
    let removedSectionSuffix = false
    while (SECTION_SUFFIX.test(value)) {
      removedSectionSuffix = true
      value = value.replace(SECTION_SUFFIX, '')
      if (aliases.has(value)) return aliases.get(value)
      if (looseAliases.has(looseIdentity(value))) return looseAliases.get(looseIdentity(value))
    }
    // Do not erase a section hyphen as a loose match. R105-A is a section of
    // R105 and must never be treated as the distinct uploaded room R105A.
    if (removedSectionSuffix) return ''
    return looseAliases.get(looseIdentity(original)) || ''
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
