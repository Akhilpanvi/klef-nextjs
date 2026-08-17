import { requireAuth }  from '@/lib/auth'
import { connectDB }    from '@/lib/mongodb'
import RoomwiseEntry    from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot from '@/lib/models/RoomwiseSnapshot'
import { parseLabel, resolveRoom, subGroupOf, WINGS } from '@/lib/roomLabel'
import { buildRoomMaster, buildExcludedReport } from '@/lib/roomMaster'

/**
 * Slot summary for clash-removal planning.
 *
 * GET /api/free/slot-summary?days=1,2&periods=3,4
 *
 * Returns, for the selected day(s) + hour(s):
 *   • sections running, pivoted programme × year, as COE (B.Tech / M.Tech /
 *     FED sub-tables) and MHS
 *   • the course list behind every cell, so the UI needs no 2nd call
 *   • rooms occupied vs free per wing, each with the full room list
 *     (capacity, type, block/floor and what it is allotted to)
 */
export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const { days, day, periods } = req.query
  const dayNums = String(days ?? day ?? '')
    .split(',').map(Number).filter(d => d >= 1 && d <= 6)
  const periodNums = String(periods ?? '')
    .split(',').map(Number).filter(p => p >= 1 && p <= 24)

  if (!dayNums.length || !periodNums.length)
    return res.status(400).json({ success: false, message: 'days and periods required' })

  await connectDB()

  const snap = await RoomwiseSnapshot.findOne().lean()
  if (!snap)
    return res.json({ success: true, noData: true, message: 'No room timetable uploaded yet.' })

  const dataset = snap.snapshotId

  const entries = await RoomwiseEntry.find(
    { dataset, day: { $in: dayNums }, hour: { $in: periodNums } },
    'room_no label day hour').lean()

  // Countable rooms, with the wing / sports / no-capacity rules applied.
  const { room, excluded, knownRooms } = await buildRoomMaster(dayNums)

  // ── Walk the slot's entries ────────────────────────────────────────────────
  const cells     = {}   // "wing|sub|programme|year" -> Map(courseKey -> {...})
  const sections  = {}   // same key -> Set(section numbers)
  const busyRooms = new Set()
  const unmatched = new Map()   // resolved key -> raw timetable names + a sample class
  let unparsed = 0

  for (const e of entries) {
    const r = resolveRoom(e.room_no, knownRooms)
    if (r) {
      busyRooms.add(r)
      if (!room.has(r)) {
        const u = unmatched.get(r) || { raws: new Set(), sample: e.label || '' }
        u.raws.add(String(e.room_no || '').trim())
        unmatched.set(r, u)
      }
    }

    const p = parseLabel(e.label)
    if (!p) { unparsed++; continue }

    const sub = subGroupOf(p.program, p.year)
    const key = `${p.category}|${sub}|${p.program}|${p.year}`
    ;(sections[key] ||= new Set()).add(p.section)

    const bucket = (cells[key] ||= new Map())
    const cKey   = `${p.course_code}|${p.component}|${p.section}`
    const hit    = bucket.get(cKey)
    if (hit) { hit.rooms.add(r); hit.days.add(e.day); hit.hours.add(e.hour) }
    else bucket.set(cKey, {
      label: p.label, course_code: p.course_code, component: p.component, section: p.section,
      rooms: new Set([r]), days: new Set([e.day]), hours: new Set([e.hour]),
    })
  }

  // ── Pivot into one table per (wing, sub-group) ─────────────────────────────
  const rowsByKey = {}
  for (const key of Object.keys(sections)) {
    const [wing, sub, program, year] = key.split('|')
    const row = (rowsByKey[`${wing}|${sub}|${program}`] ||= { wing, sub, program, years: {}, total: 0 })
    const n = sections[key].size
    row.years[year] = n
    row.total += n
  }

  // COE keeps its three sub-tables; MHS is a single table.
  const TABLES = [
    { wing: 'COE', sub: 'B.Tech', title: 'B.Tech (Year 2-4)' },
    { wing: 'COE', sub: 'M.Tech', title: 'M.Tech' },
    { wing: 'COE', sub: 'FED',    title: 'FED (B.Tech Year 1)' },
    { wing: 'MHS', sub: 'MHS',    title: 'MHS' },
  ]
  const tables = TABLES.map(t => ({
    ...t,
    rows: Object.values(rowsByKey)
      .filter(r => r.wing === t.wing && r.sub === t.sub)
      .sort((a, b) => b.total - a.total || a.program.localeCompare(b.program)),
  }))

  // ── Rooms occupied vs free per wing, with the room lists ───────────────────
  const detail = Object.fromEntries(WINGS.map(w => [w, { occupied: [], free: [] }]))
  let uncategorisedOccupied = 0

  for (const info of room.values()) {
    const bucket = detail[info.wing]
    if (!bucket) continue
    ;(busyRooms.has(info.room) ? bucket.occupied : bucket.free).push({
      room: info.room, capacity: info.capacity ?? null, type: info.type || null,
      block: info.block || null, floor: info.floor ?? null,
      wing: info.wing, allotment: info.allotment || info.wing,
      usage: info.usage || {}, status: info.status || null, notes: info.notes || '',
    })
  }
  // Everything held back from the tallies, occupied or not, with its reason.
  const excludedReport = buildExcludedReport(excluded, unmatched)
  uncategorisedOccupied = unmatched.size

  const byRoomNo = (a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })
  for (const w of WINGS) { detail[w].occupied.sort(byRoomNo); detail[w].free.sort(byRoomNo) }

  const roomStats = WINGS.map(w => ({
    wing: w,
    occupied: detail[w].occupied.length,
    free:     detail[w].free.length,
    total:    detail[w].occupied.length + detail[w].free.length,
  }))

  // Sets → arrays for JSON
  const courses = {}
  for (const [key, bucket] of Object.entries(cells)) {
    courses[key] = [...bucket.values()]
      .map(c => ({
        ...c,
        rooms: [...c.rooms].filter(Boolean).sort(),
        days:  [...c.days].sort((a, b) => a - b),
        hours: [...c.hours].sort((a, b) => a - b),
      }))
      .sort((a, b) => a.course_code.localeCompare(b.course_code) ||
        String(a.section).localeCompare(String(b.section), undefined, { numeric: true }))
  }

  res.json({
    success: true,
    days: dayNums,
    periods: periodNums,
    snapshot: snap.label || snap.filename || dataset,
    tables,
    courses,
    rooms: { byWing: roomStats, detail, masterTotal: knownRooms.size,
      uncategorisedOccupied, excluded: excludedReport },
    entryCount: entries.length,
    unparsed,
  })
}
