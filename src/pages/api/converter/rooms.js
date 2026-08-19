import { requireAuth }   from '@/lib/auth'
import { connectDB }     from '@/lib/mongodb'
import RoomwiseEntry     from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot  from '@/lib/models/RoomwiseSnapshot'
import { resolveRoom }   from '@/lib/roomLabel'
import { buildRoomMaster } from '@/lib/roomMaster'

/**
 * Room-wise timetable, merged to one row per physical room.
 *
 * GET /api/converter/rooms
 *
 * The room-wise export splits a room across its associative sections —
 * C009-MA, C009-A, C009-B, C009-C — so the same room appears four times.
 * This collapses them back to C009.
 *
 * Merging is not always lossless. Most duplicated cells hold the identical
 * class, but some sub-rooms carry different sections of one course (A306 at
 * one period holds SEC 66, 67, 71, 72 and 74). Every distinct label is kept
 * and the cell is marked, rather than silently keeping the first.
 */
const SECTION_SUFFIX = /-(MA|AB|CD|[A-F])$/i

/**
 * Only the teaching grid, periods 1-11, is carried into the merged output.
 * Period 12 onwards is overflow and evening slots — 2,845 of the 21,729 rows —
 * and is dropped rather than shown.
 */
export const MAX_HOUR = 11
const isDroppedHour = h => !(h >= 1 && h <= MAX_HOUR)

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  await connectDB()

  const snap = await RoomwiseSnapshot.findOne().lean()
  if (!snap)
    return res.json({
      success: true, noData: true,
      message: 'No Room-wise timetable uploaded yet — add it in Admin.',
    })

  const [rows, master] = await Promise.all([
    RoomwiseEntry.find({ dataset: snap.snapshotId }, 'room_no day hour label').lean(),
    buildRoomMaster([1, 2, 3, 4, 5, 6]),
  ])
  const known = master.knownRooms

  // Prefer the room master, so a name it recognises wins; otherwise strip the
  // section suffix repeatedly. That second path matters because roughly a
  // third of the rooms in the timetable are not in the master at all.
  const baseRoom = (raw) => {
    const s = String(raw || '').trim().toUpperCase()
    if (!s) return ''
    const viaMaster = resolveRoom(s, known)
    if (known.has(viaMaster)) return viaMaster
    let t = s
    while (SECTION_SUFFIX.test(t)) t = t.replace(SECTION_SUFFIX, '')
    return t
  }

  const merged = new Map()
  let maxHour = 0
  let droppedRows = 0
  for (const e of rows) {
    if (isDroppedHour(e.hour)) { droppedRows++; continue }
    const base = baseRoom(e.room_no)
    if (!base) continue
    if (e.hour > maxHour) maxHour = e.hour

    const m = merged.get(base) || { room: base, variants: new Set(), cells: new Map() }
    m.variants.add(String(e.room_no || '').trim())

    const key = `${e.day}-${e.hour}`
    const cell = m.cells.get(key) || { labels: new Set(), rows: 0 }
    const label = String(e.label || '').trim()
    if (label) cell.labels.add(label)
    cell.rows++
    m.cells.set(key, cell)
    merged.set(base, m)
  }

  const rooms = [...merged.values()]
    .map(m => {
      const cells = [...m.cells.entries()].map(([k, c]) => {
        const [d, h] = k.split('-').map(Number)
        const labels = [...c.labels].sort()
        return { d, h, labels, rows: c.rows, merged: labels.length > 1 }
      }).sort((a, b) => a.d - b.d || a.h - b.h)
      return {
        room: m.room,
        variants: [...m.variants].sort(),
        cells,
        busyCells: cells.length,
        conflictCells: cells.filter(c => c.merged).length,
      }
    })
    .sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }))

  const kept = rows.filter(r => !isDroppedHour(r.hour))
  const sourceNames = new Set(kept.map(r => String(r.room_no || '').trim()).filter(Boolean))
  const hours = [...new Set(kept.map(r => r.hour))].sort((a, b) => a - b)
  const busyCells   = rooms.reduce((n, r) => n + r.busyCells, 0)
  const conflicts   = rooms.reduce((n, r) => n + r.conflictCells, 0)

  res.json({
    success: true,
    snapshot: snap.label || snap.filename || snap.snapshotId,
    maxHour: maxHour || 11,
    hours,
    droppedHours: { from: MAX_HOUR + 1, rows: droppedRows },
    rooms,
    stats: {
      sourceRows: rows.length,
      sourceRowsUsed: kept.length,
      droppedRows,
      sourceRooms: sourceNames.size,
      mergedRooms: rooms.length,
      busyCells,
      duplicateRowsCollapsed: kept.length - busyCells,
      conflictCells: conflicts,
      roomsWithConflicts: rooms.filter(r => r.conflictCells).length,
      unchangedRooms: rooms.filter(r => r.variants.length === 1).length,
    },
  })
}
