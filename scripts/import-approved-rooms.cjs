// Usage: node scripts/import-approved-rooms.cjs "C:\path\ROOM DATA.xlsx"
const XLSX = require('xlsx')
const fs = require('node:fs')
const path = require('node:path')

if (!process.argv[2]) throw new Error('Provide the approved room workbook path')
const workbook = XLSX.readFile(process.argv[2])
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })
const seen = new Set()
const rooms = rows.map(row => {
  const cells = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), value]))
  const name = String(cells['Room No']).trim().toUpperCase()
  const room_no = name.replace(/\s+(AEROSPACE|CAD LAB)$/, '').replace(/\s+/g, '')
  const capacity = Number(cells.CAP)
  if (!room_no || room_no === 'UNDEFINED' || !cells['Block Name'] || !cells.TYPE || !(capacity > 0)) {
    throw new Error(`Invalid approved room row: ${JSON.stringify(cells)}`)
  }
  if (seen.has(room_no)) throw new Error(`Duplicate approved room: ${room_no}`)
  seen.add(room_no)
  return {
    room_no, source_name: name, block: String(cells['Block Name']).trim(),
    room_type: cells.TYPE === 'Classroom' ? 'CR' : String(cells.TYPE).trim(), capacity,
  }
})
if (!rooms.length) throw new Error('The workbook contains no rooms')
const output = path.join(__dirname, '../src/lib/data/approvedRooms.json')
fs.writeFileSync(output, JSON.stringify(rooms, null, 2) + '\n')
console.log(`Imported ${rooms.length} approved rooms into ${output}`)
