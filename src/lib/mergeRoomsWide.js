import { canonicalRoom } from '@/lib/roomLabel'

/**
 * mergeRoomsWide
 * ──────────────
 * Merge a wide Room-wise timetable — one row per room name, one column per
 * day+period — so each physical room becomes a single row.
 *
 *     C009-MA, C009-A, C009-B, C009-C   ->   C009
 *
 * Pure and dependency-free, so it runs in the browser against a file the user
 * picked. Nothing here reads or writes the database: the upload path on
 * /converter/rooms converts and downloads without saving anything.
 *
 * It differs from the server path in one way, deliberately. The API resolves
 * room names against the room master first, so a name the master recognises
 * wins; a file dropped in from outside has no master to consult, so this can
 * only strip the associative-section suffix. Counts between the two will
 * therefore differ slightly for rooms the master would have renamed.
 */

const SECTION_SUFFIX = /-(MA|AB|CD|[A-F])$/i
const FREE_MARKERS = new Set(['', '-', '--', 'nil', 'none'])
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** The physical room: canonical name with every section suffix removed. */
export function baseRoomStandalone(raw) {
  let s = canonicalRoom(raw)
  while (SECTION_SUFFIX.test(s)) s = s.replace(SECTION_SUFFIX, '')
  return s
}

/** Fold a header for comparison: 'Mon 1', 'MON-1' and 'mon1' all match. */
export const normKey = name =>
  String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** The column holding the room name, or null. */
export function findRoomColumn(headers) {
  const wanted = new Set(['roomno', 'room', 'roomnumber', 'roomname'])
  return headers.find(h => wanted.has(normKey(h)))
    || headers.find(h => normKey(h).includes('room'))
    || null
}

/** [{ header, day, hour }] for every day+period column within maxHour. */
export function findSlotColumns(headers, maxHour = 11) {
  const out = []
  for (const h of headers) {
    const m = /^(mon|tue|wed|thu|fri|sat|sun)(\d{1,2})$/.exec(normKey(h))
    if (!m) continue
    const day = m[1]
    const hour = parseInt(m[2], 10)
    if (day === 'sun' || !(hour >= 1 && hour <= maxHour)) continue
    out.push({ header: h, day, hour })
  }
  out.sort((a, b) => DAY_KEYS.indexOf(a.day) - DAY_KEYS.indexOf(b.day) || a.hour - b.hour)
  return out
}

/** Sort C9 before C10, and keep 'A 301' beside 'A306' despite the space. */
export const roomSortKey = name =>
  String(name).replace(/\s+/g, '').replace(/\d+/g, d => d.padStart(6, '0'))

/**
 * Merge the rows. Returns the same shape the /api/converter/rooms endpoint
 * produces, so the preview and the export render either source unchanged.
 */
export function mergeWideRows(rows, { maxHour = 11 } = {}) {
  if (!rows?.length) throw new Error('The file has no data rows.')

  const headers = Object.keys(rows[0])
  const roomCol = findRoomColumn(headers)
  if (!roomCol)
    throw new Error(`No room column found. Expected something like "Room No". Columns: ${headers.slice(0, 12).join(', ')}`)

  const slots = findSlotColumns(headers, maxHour)
  if (!slots.length)
    throw new Error(`No day/period columns found. Expected headers like "mon1" … "sat${maxHour}".`)

  const droppedCols = headers.filter(h =>
    /^(mon|tue|wed|thu|fri|sat|sun)(\d{1,2})$/.test(normKey(h)) &&
    !slots.some(s => s.header === h)).length

  const merged = new Map()
  const sourceNames = new Set()
  let filledCells = 0

  for (const row of rows) {
    const raw = String(row[roomCol] ?? '').trim()
    if (!raw) continue
    sourceNames.add(raw)
    const base = baseRoomStandalone(raw)
    if (!base) continue

    const entry = merged.get(base) || { room: base, variants: new Set(), cells: new Map() }
    entry.variants.add(raw)

    for (const { header, day, hour } of slots) {
      const value = String(row[header] ?? '').trim()
      if (FREE_MARKERS.has(value.toLowerCase())) continue
      filledCells++
      const key = `${day}-${hour}`
      const cell = entry.cells.get(key) || { labels: new Set(), rows: 0 }
      cell.labels.add(value)
      cell.rows++
      entry.cells.set(key, cell)
    }
    merged.set(base, entry)
  }

  const roomsOut = [...merged.values()]
    .map(m => {
      const cells = [...m.cells.entries()].map(([k, c]) => {
        const [day, hour] = k.split('-')
        const labels = [...c.labels].sort()
        return {
          d: DAY_KEYS.indexOf(day) + 1, h: Number(hour),
          labels, rows: c.rows, merged: labels.length > 1,
        }
      }).sort((a, b) => a.d - b.d || a.h - b.h)
      return {
        room: m.room,
        variants: [...m.variants].sort(),
        cells,
        busyCells: cells.length,
        conflictCells: cells.filter(c => c.merged).length,
      }
    })
    .sort((a, b) => roomSortKey(a.room).localeCompare(roomSortKey(b.room)))

  const busyCells = roomsOut.reduce((n, r) => n + r.busyCells, 0)
  const conflicts = roomsOut.reduce((n, r) => n + r.conflictCells, 0)
  const hours = [...new Set(slots.map(s => s.hour))].sort((a, b) => a - b)

  return {
    rooms: roomsOut,
    hours,
    maxHour,
    droppedHours: { from: maxHour + 1, rows: droppedCols },
    stats: {
      sourceRows: rows.length,
      sourceRowsUsed: filledCells,
      droppedRows: 0,                 // whole columns are skipped, not rows
      droppedColumns: droppedCols,
      sourceRooms: sourceNames.size,
      mergedRooms: roomsOut.length,
      busyCells,
      duplicateRowsCollapsed: filledCells - busyCells,
      conflictCells: conflicts,
      roomsWithConflicts: roomsOut.filter(r => r.conflictCells).length,
      unchangedRooms: roomsOut.filter(r => r.variants.length === 1).length,
      emptyRooms: roomsOut.filter(r => !r.busyCells).length,
    },
  }
}
