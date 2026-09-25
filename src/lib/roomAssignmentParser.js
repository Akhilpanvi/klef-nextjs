import * as XLSX from 'xlsx'
import { approvedRooms } from './approvedRooms.js'

export const ASSIGNMENT_COLUMNS = ['ROOM NO', 'ASSIGNED', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const clean = value => String(value ?? '').trim()
const compact = value => clean(value).toUpperCase().replace(/\s+/g, '')

export function parseRoomAssignmentBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('The workbook has no worksheet')
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const headers = (matrix[0] || []).map(value => clean(value).toUpperCase())
  const missingColumns = ASSIGNMENT_COLUMNS.filter(column => !headers.includes(column))
  if (missingColumns.length) throw new Error(`Missing columns: ${missingColumns.join(', ')}`)

  const approvedNames = new Map(approvedRooms.flatMap(room =>
    [room.room_no, room.source_name].map(name => [compact(name), room.room_no])))
  const matches = new Map()
  const unmatched = new Set()
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  for (const raw of rows) {
    const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [clean(key).toUpperCase(), value]))
    const sourceName = clean(row['ROOM NO'])
    if (!sourceName) continue
    const roomNo = approvedNames.get(compact(sourceName))
    if (!roomNo) { unmatched.add(sourceName); continue }
    if (!matches.has(roomNo)) matches.set(roomNo, {
      room_no: roomNo,
      assigned: new Set(),
      day_assignments: Object.fromEntries(DAYS.map(day => [day, new Set()])),
    })
    const record = matches.get(roomNo)
    if (clean(row.ASSIGNED)) record.assigned.add(clean(row.ASSIGNED))
    for (const day of DAYS) {
      const value = clean(row[day.toUpperCase()])
      if (value) record.day_assignments[day].add(value)
    }
  }

  if (!matches.size) throw new Error('No approved room names matched the workbook')
  const join = values => [...values].join(' / ') || null
  const docs = [...matches.values()].map(record => ({
    room_no: record.room_no,
    assigned: join(record.assigned),
    day_assignments: Object.fromEntries(DAYS.map(day => [day, join(record.day_assignments[day])])),
  })).sort((a, b) => a.room_no.localeCompare(b.room_no, undefined, { numeric: true }))

  return {
    docs,
    missingRooms: approvedRooms.filter(room => !matches.has(room.room_no)).map(room => room.room_no),
    unmatchedRooms: [...unmatched].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  }
}
