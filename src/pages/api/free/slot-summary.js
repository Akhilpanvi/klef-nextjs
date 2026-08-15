import { requireAuth }  from '@/lib/auth'
import { connectDB }    from '@/lib/mongodb'
import RoomwiseEntry    from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot from '@/lib/models/RoomwiseSnapshot'
import RoomMeta         from '@/lib/models/RoomMeta'
import RoomAllocation   from '@/lib/models/RoomAllocation'
import { parseLabel, resolveRoom } from '@/lib/roomLabel'

/**
 * Slot summary for clash-removal planning.
 *
 * GET /api/free/slot-summary?day=1&periods=3,4
 *
 * Returns, for the selected day + hour(s):
 *   • sections running, pivoted programme × year, split COE / MHS
 *   • the actual course list behind every cell (so the UI needs no 2nd call)
 *   • rooms occupied vs free per allocation category (COE/MHS/CRT/FED/COR)
 */
export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const { day, periods } = req.query
  if (!day || !periods)
    return res.status(400).json({ success: false, message: 'day and periods required' })

  const dayNum     = parseInt(day, 10)
  const periodNums = String(periods).split(',').map(Number).filter(p => p >= 1 && p <= 24)
  if (!dayNum || !periodNums.length)
    return res.status(400).json({ success: false, message: 'invalid day or periods' })

  await connectDB()

  const snap = await RoomwiseSnapshot.findOne().lean()
  if (!snap)
    return res.json({ success: true, noData: true, message: 'No room timetable uploaded yet.' })

  const dataset = snap.snapshotId

  const [entries, metas, allocs] = await Promise.all([
    RoomwiseEntry.find({ dataset, day: dayNum, hour: { $in: periodNums } },
      'room_no label hour').lean(),
    RoomMeta.find({}, 'room_no alloted_to room_type capacity block').lean(),
    RoomAllocation.find({}, 'roomNo coeMhs').lean(),
  ])

  // ── Room master: category per physical room ────────────────────────────────
  const categoryByRoom = new Map()
  for (const m of metas) {
    const key = String(m.room_no || '').trim().toUpperCase()
    if (key) categoryByRoom.set(key, m.alloted_to || 'UNSPECIFIED')
  }
  // RoomAllocation covers a few rooms RoomMeta misses.
  for (const a of allocs) {
    const key = String(a.roomNo || '').trim().toUpperCase()
    if (key && !categoryByRoom.has(key) && a.coeMhs) categoryByRoom.set(key, a.coeMhs)
  }
  const knownRooms = new Set(categoryByRoom.keys())

  // ── Walk the slot's entries ────────────────────────────────────────────────
  const cells    = {}   // "CAT|Programme|Year" -> Map(label -> {..., rooms:Set})
  const sections = {}   // "CAT|Programme|Year" -> Set(section numbers)
  const busyRooms = new Set()
  let unparsed = 0

  for (const e of entries) {
    const room = resolveRoom(e.room_no, knownRooms)
    if (room) busyRooms.add(room)

    const p = parseLabel(e.label)
    if (!p) { unparsed++; continue }

    const key = `${p.category}|${p.program}|${p.year}`
    ;(sections[key] ||= new Set()).add(p.section)

    const bucket = (cells[key] ||= new Map())
    const cKey   = `${p.course_code}|${p.component}|${p.section}`
    const hit    = bucket.get(cKey)
    if (hit) { hit.rooms.add(room); hit.hours.add(e.hour) }
    else bucket.set(cKey, {
      label: p.label, course_code: p.course_code, component: p.component,
      section: p.section, rooms: new Set([room]), hours: new Set([e.hour]),
    })
  }

  // ── Pivot into programme rows per category ─────────────────────────────────
  const groups = { COE: [], MHS: [] }
  const rowsByKey = {}
  for (const key of Object.keys(sections)) {
    const [cat, program, year] = key.split('|')
    const row = (rowsByKey[`${cat}|${program}`] ||= { program, category: cat, years: {}, total: 0 })
    const n = sections[key].size
    row.years[year] = n
    row.total += n
  }
  for (const row of Object.values(rowsByKey)) groups[row.category]?.push(row)
  for (const cat of Object.keys(groups))
    groups[cat].sort((a, b) => b.total - a.total || a.program.localeCompare(b.program))

  // ── Room occupancy per allocation category ─────────────────────────────────
  const totals = {}, occupied = {}
  for (const cat of categoryByRoom.values()) totals[cat] = (totals[cat] || 0) + 1
  let uncategorisedOccupied = 0
  for (const r of busyRooms) {
    const cat = categoryByRoom.get(r)
    if (cat) occupied[cat] = (occupied[cat] || 0) + 1
    else uncategorisedOccupied++
  }
  const roomStats = Object.keys(totals).sort().map(cat => ({
    category: cat,
    total:    totals[cat],
    occupied: occupied[cat] || 0,
    free:     totals[cat] - (occupied[cat] || 0),
  }))

  // Sets → arrays for JSON
  const courses = {}
  for (const [key, bucket] of Object.entries(cells)) {
    courses[key] = [...bucket.values()]
      .map(c => ({ ...c, rooms: [...c.rooms].sort(), hours: [...c.hours].sort((a, b) => a - b) }))
      .sort((a, b) => a.course_code.localeCompare(b.course_code) ||
                      String(a.section).localeCompare(String(b.section), undefined, { numeric: true }))
  }

  res.json({
    success: true,
    day: dayNum,
    periods: periodNums,
    snapshot: snap.label || snap.filename || dataset,
    groups,
    courses,
    rooms: {
      byCategory: roomStats,
      masterTotal: knownRooms.size,
      occupiedKnown: busyRooms.size - uncategorisedOccupied,
      uncategorisedOccupied,
    },
    entryCount: entries.length,
    unparsed,
  })
}
