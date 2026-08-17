import { requireAuth }  from '@/lib/auth'
import { connectDB }    from '@/lib/mongodb'
import RoomwiseEntry    from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot from '@/lib/models/RoomwiseSnapshot'
import { parseLabel, resolveRoom, WINGS } from '@/lib/roomLabel'
import { buildRoomMaster, buildExcludedReport } from '@/lib/roomMaster'

/**
 * Year-wise room usage, for reclaiming rooms from a year that is idle.
 *
 * GET /api/free/year-rooms?year=2&days=1&periods=3,4
 *
 * Splits every countable room into four buckets for the selected slot:
 *   thisYear   - in use by the chosen year
 *   otherYears - in use, but by other years, so not available
 *   reclaimable- the chosen year uses it elsewhere in the week but not now,
 *                and nobody else is in it either. This is the actionable set.
 *   free       - not used by anyone in this slot, and not one of the above
 *
 * The week-wide pass is what makes "reclaimable" possible: it needs to know
 * which rooms belong to the year in general, not only in this slot.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const { year, days, day, periods } = req.query
  const dayNums = String(days ?? day ?? '')
    .split(',').map(Number).filter(d => d >= 1 && d <= 6)
  const periodNums = String(periods ?? '')
    .split(',').map(Number).filter(p => p >= 1 && p <= 24)
  const yearNum = parseInt(year, 10)

  if (!dayNums.length || !periodNums.length)
    return res.status(400).json({ success: false, message: 'days and periods required' })
  if (!yearNum || yearNum < 1 || yearNum > 5)
    return res.status(400).json({ success: false, message: 'year (1-5) required' })

  await connectDB()

  const snap = await RoomwiseSnapshot.findOne().lean()
  if (!snap)
    return res.json({ success: true, noData: true, message: 'No room timetable uploaded yet.' })

  const dataset = snap.snapshotId

  const [slotEntries, weekEntries] = await Promise.all([
    RoomwiseEntry.find(
      { dataset, day: { $in: dayNums }, hour: { $in: periodNums } },
      'room_no label day hour').lean(),
    // Week-wide, to learn which rooms this year normally occupies.
    RoomwiseEntry.find({ dataset }, 'room_no label').lean(),
  ])

  const { room, excluded, knownRooms } = await buildRoomMaster(dayNums)

  // ── Who is in each room during the slot ────────────────────────────────────
  const byRoom    = new Map()   // room -> { years:Set, classes:Map }
  const unmatched = new Map()
  const yearsSeen = new Set()
  let unparsed = 0

  for (const e of slotEntries) {
    const r = resolveRoom(e.room_no, knownRooms)
    if (r && !room.has(r)) {
      const u = unmatched.get(r) || { raws: new Set(), sample: e.label || '' }
      u.raws.add(String(e.room_no || '').trim())
      unmatched.set(r, u)
    }

    const p = parseLabel(e.label)
    if (!p) { unparsed++; continue }
    yearsSeen.add(p.year)
    if (!r || !room.has(r)) continue

    const slot = byRoom.get(r) || { years: new Set(), classes: new Map() }
    slot.years.add(p.year)
    const key = `${p.year}|${p.program}|${p.course_code}|${p.component}|${p.section}`
    const hit = slot.classes.get(key)
    if (hit) { hit.days.add(e.day); hit.hours.add(e.hour) }
    else slot.classes.set(key, {
      year: p.year, program: p.program, course_code: p.course_code,
      component: p.component, section: p.section,
      days: new Set([e.day]), hours: new Set([e.hour]),
    })
    byRoom.set(r, slot)
  }

  // ── Rooms this year uses anywhere in the week ─────────────────────────────
  const yearWeekRooms = new Set()
  for (const e of weekEntries) {
    const p = parseLabel(e.label)
    if (!p) continue
    yearsSeen.add(p.year)
    if (p.year !== yearNum) continue
    const r = resolveRoom(e.room_no, knownRooms)
    if (r && room.has(r)) yearWeekRooms.add(r)
  }

  // ── Bucket every countable room ───────────────────────────────────────────
  const buckets = { thisYear: [], otherYears: [], reclaimable: [], free: [] }

  const shape = (info, slot) => ({
    room: info.room, capacity: info.capacity ?? null, type: info.type || null,
    block: info.block || null, floor: info.floor ?? null,
    wing: info.wing, allotment: info.allotment || info.wing,
    usage: info.usage || {},
    usedByYear: yearWeekRooms.has(info.room),
    years: slot ? [...slot.years].sort((a, b) => a - b) : [],
    classes: slot
      ? [...slot.classes.values()]
        .map(c => ({ ...c, days: [...c.days].sort((a, b) => a - b), hours: [...c.hours].sort((a, b) => a - b) }))
        .sort((a, b) => a.year - b.year ||
          a.course_code.localeCompare(b.course_code) ||
          String(a.section).localeCompare(String(b.section), undefined, { numeric: true }))
      : [],
  })

  for (const info of room.values()) {
    const slot = byRoom.get(info.room)
    const row  = shape(info, slot)
    if (slot?.years.has(yearNum))            buckets.thisYear.push(row)
    else if (slot && slot.years.size)        buckets.otherYears.push(row)
    else if (yearWeekRooms.has(info.room))   buckets.reclaimable.push(row)
    else                                     buckets.free.push(row)
  }

  const byRoomNo = (a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })
  for (const k of Object.keys(buckets)) buckets[k].sort(byRoomNo)

  const perWing = Object.fromEntries(WINGS.map(w => [w, {
    thisYear:    buckets.thisYear.filter(r => r.wing === w).length,
    otherYears:  buckets.otherYears.filter(r => r.wing === w).length,
    reclaimable: buckets.reclaimable.filter(r => r.wing === w).length,
    free:        buckets.free.filter(r => r.wing === w).length,
  }]))

  const seats = rows => rows.reduce((s, r) => s + (r.capacity || 0), 0)

  res.json({
    success: true,
    year: yearNum,
    days: dayNums,
    periods: periodNums,
    snapshot: snap.label || snap.filename || dataset,
    yearsAvailable: [...yearsSeen].filter(Boolean).sort((a, b) => a - b),
    buckets,
    totals: {
      thisYear:    buckets.thisYear.length,
      otherYears:  buckets.otherYears.length,
      reclaimable: buckets.reclaimable.length,
      free:        buckets.free.length,
      master:      knownRooms.size,
      yearWeekRooms: yearWeekRooms.size,
      seatsReclaimable: seats(buckets.reclaimable),
      seatsFree:        seats(buckets.free),
    },
    perWing,
    rooms: {
      excluded: buildExcludedReport(excluded, unmatched),
      uncategorisedOccupied: unmatched.size,
    },
    entryCount: slotEntries.length,
    unparsed,
  })
}
