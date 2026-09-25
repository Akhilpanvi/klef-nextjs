import * as XLSX from 'xlsx'
import { approvedRoomKey } from './approvedRooms.js'

export const ASSIGNMENT_COLUMNS = ['ROOM NO', 'ASSIGNED', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const clean = value => String(value ?? '').trim()
const compact = value => clean(value).toUpperCase().replace(/\s+/g, '')
const numberOrNull = value => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) && String(value ?? '').trim() ? parsed : null
}
const capacityOrNull = value => {
  const raw = clean(value)
  if (!raw) return null
  const parts = raw.split('+').map(part => part.trim())
  if (parts.length > 1 && parts.every(part => /^\d+(?:\.\d+)?$/.test(part)))
    return parts.reduce((total, part) => total + Number(part), 0)
  return numberOrNull(raw)
}

export function parseRoomAssignmentBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('The workbook has no worksheet')
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const headers = (matrix[0] || []).map(value => clean(value).toUpperCase())
  const missingColumns = ASSIGNMENT_COLUMNS.filter(column => !headers.includes(column))
  if (missingColumns.length) throw new Error(`Missing columns: ${missingColumns.join(', ')}`)

  const matches = new Map()
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  let duplicateCount = 0

  for (const raw of rows) {
    const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [clean(key).toUpperCase(), value]))
    const sourceName = clean(row['ROOM NO'])
    if (!sourceName) continue
    const roomNo = approvedRoomKey(sourceName) || clean(sourceName).toUpperCase().replace(/\s+/g, ' ')
    const identity = compact(roomNo)
    if (matches.has(identity)) duplicateCount++
    if (!matches.has(identity)) matches.set(identity, {
      room_no: roomNo,
      source_name: sourceName,
      block: clean(row.BLOCK) || null,
      floor: numberOrNull(row.FLOOR),
      capacity: capacityOrNull(row['ROOM CAPACITY'] ?? row.CAPACITY ?? row.CAP),
      room_type: clean(row.TYPE) || null,
      assigned: new Set(),
      day_assignments: Object.fromEntries(DAYS.map(day => [day, new Set()])),
    })
    const record = matches.get(identity)
    record.block ||= clean(row.BLOCK) || null
    record.floor ??= numberOrNull(row.FLOOR)
    record.capacity ??= capacityOrNull(row['ROOM CAPACITY'] ?? row.CAPACITY ?? row.CAP)
    record.room_type ||= clean(row.TYPE) || null
    if (clean(row.ASSIGNED)) record.assigned.add(clean(row.ASSIGNED))
    for (const day of DAYS) {
      const value = clean(row[day.toUpperCase()])
      if (value) record.day_assignments[day].add(value)
    }
  }

  if (!matches.size) throw new Error('No room rows were found in the workbook')
  const join = values => [...values].join(' / ') || null
  const docs = [...matches.values()].map(record => ({
    room_no: record.room_no,
    source_name: record.source_name,
    block: record.block,
    floor: record.floor,
    capacity: record.capacity,
    room_type: record.room_type,
    assigned: join(record.assigned),
    day_assignments: Object.fromEntries(DAYS.map(day => [day, join(record.day_assignments[day])])),
  })).sort((a, b) => a.room_no.localeCompare(b.room_no, undefined, { numeric: true }))

  return {
    docs,
    duplicateCount,
  }
}
