// Import assignment information without changing the approved room inventory.
// Usage: node scripts/import-room-assignments.cjs "C:\path\ROOM _DATA NEW.xlsx"
const XLSX = require('xlsx')
const fs = require('node:fs')
const path = require('node:path')
const approved = require('../src/lib/data/approvedRooms.json')
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const clean = value => String(value ?? '').trim()
const compact = value => clean(value).toUpperCase().replace(/\s+/g, '')

function importAssignments(rows) {
  // Allocation-sheet names refer to physical rooms. Do not guess section aliases.
  const names = new Map(approved.flatMap(room => [room.room_no, room.source_name].map(name => [compact(name), room.room_no])))
  const matches = new Map()
  const unmatched = new Set()
  for (const raw of rows) {
    const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key.trim().toUpperCase(), value]))
    const name = clean(row['ROOM NO'])
    if (!name) continue
    const key = names.get(compact(name))
    if (!key) { unmatched.add(name); continue }
    if (!matches.has(key)) matches.set(key, { room_no: key, assigned: new Set(), days: Object.fromEntries(DAYS.map(day => [day, new Set()])) })
    const record = matches.get(key)
    if (clean(row.ASSIGNED)) record.assigned.add(clean(row.ASSIGNED))
    for (const day of DAYS) if (clean(row[day.toUpperCase()])) record.days[day].add(clean(row[day.toUpperCase()]))
  }
  const join = values => [...values].join(' / ') || null
  const rooms = [...matches.values()].map(record => ({
    room_no: record.room_no, assigned: join(record.assigned),
    day_assignments: Object.fromEntries(DAYS.map(day => [day, join(record.days[day])])),
  })).sort((a, b) => a.room_no.localeCompare(b.room_no, undefined, { numeric: true }))
  return { rooms, missingRooms: approved.filter(room => !matches.has(room.room_no)).map(room => room.room_no), unmatchedRooms: [...unmatched].sort() }
}

module.exports = { importAssignments }
if (require.main === module) {
  if (!process.argv[2]) throw new Error('Provide the assignment workbook path')
  const workbook = XLSX.readFile(process.argv[2])
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0].map(value => clean(value).toUpperCase())
  for (const column of ['ROOM NO', 'ASSIGNED', ...DAYS.map(day => day.toUpperCase())]) {
    if (!headers.includes(column)) throw new Error(`Missing column: ${column}`)
  }
  const result = importAssignments(XLSX.utils.sheet_to_json(sheet, { defval: '' }))
  if (!result.rooms.length) throw new Error('No approved rooms matched; existing assignment data was not replaced')
  const output = { source: path.basename(process.argv[2]), rooms: result.rooms }
  fs.writeFileSync(path.join(__dirname, '../src/lib/data/roomAssignments.json'), JSON.stringify(output, null, 2) + '\n')
  console.log(`Imported assignments for ${result.rooms.length} approved rooms.`)
  console.log('Approved rooms without an exact match:', result.missingRooms.join(', '))
  console.log(`Ignored ${result.unmatchedRooms.length} distinct workbook names outside the approved inventory.`)
}
