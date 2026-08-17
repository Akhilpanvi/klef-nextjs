import { requireAuth }     from '@/lib/auth'
import { connectDB }       from '@/lib/mongodb'
import FacultywiseEntry    from '@/lib/models/FacultywiseEntry'
import FacultywiseFaculty  from '@/lib/models/FacultywiseFaculty'
import FacultywiseSnapshot from '@/lib/models/FacultywiseSnapshot'
import { resolveRoom, WINGS } from '@/lib/roomLabel'
import { buildRoomMaster, buildExcludedReport } from '@/lib/roomMaster'

/**
 * Free faculty AND free rooms for one slot, both from the Faculty-wise TT.
 *
 * GET /api/free/facultywise?days=1&periods=3,4[&campus=KLVZA][&want=faculty|rooms|both]
 *
 * The faculty-wise grid names a room in every busy cell, so a single upload
 * answers both questions and the two answers cannot disagree with each other.
 *
 * Free faculty needs the roster, not the slot entries: a lecturer with an
 * empty week has no entries at all, so anyone absent from the busy set is
 * free — which is why the upload stores the roster separately.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const { days, day, periods, campus, want = 'both' } = req.query
  const dayNums = String(days ?? day ?? '')
    .split(',').map(Number).filter(d => d >= 1 && d <= 7)
  const periodNums = String(periods ?? '')
    .split(',').map(Number).filter(p => p >= 1 && p <= 24)

  if (!dayNums.length || !periodNums.length)
    return res.status(400).json({ success: false, message: 'days and periods required' })

  await connectDB()

  const snap = await FacultywiseSnapshot.findOne().lean()
  if (!snap)
    return res.json({
      success: true, noData: true,
      message: 'No faculty-wise timetable uploaded yet. Upload it in Admin.',
    })

  const dataset = snap.snapshotId
  const rosterQuery = { dataset }
  if (campus) rosterQuery.campus = campus

  const [entries, roster] = await Promise.all([
    FacultywiseEntry.find({ dataset, day: { $in: dayNums }, hour: { $in: periodNums } },
      'uni_id faculty_name campus day hour room_no degree offering_level course_code component section raw').lean(),
    FacultywiseFaculty.find(rosterQuery).lean(),
  ])

  const wantFaculty = want === 'both' || want === 'faculty'
  const wantRooms   = want === 'both' || want === 'rooms'

  // ── Who is busy, and with what ────────────────────────────────────────────
  const busyById = new Map()
  for (const e of entries) {
    const id = e.uni_id || e.faculty_name
    if (!id) continue
    const hit = busyById.get(id) || { classes: new Map() }
    const key = `${e.day}|${e.hour}|${e.course_code || e.raw}`
    hit.classes.set(key, {
      day: e.day, hour: e.hour, room_no: e.room_no || null,
      degree: e.degree || null, offering_level: e.offering_level || null,
      course_code: e.course_code || null, component: e.component || null,
      section: e.section || null,
    })
    busyById.set(id, hit)
  }

  const busyFaculty = [], freeFaculty = []
  if (wantFaculty) {
    for (const f of roster) {
      const hit = busyById.get(f.uni_id)
      const row = {
        uni_id: f.uni_id, faculty_name: f.faculty_name || null,
        campus: f.campus || null, weekSlots: f.slotCount || 0,
      }
      if (hit) {
        busyFaculty.push({
          ...row,
          classes: [...hit.classes.values()]
            .sort((a, b) => a.day - b.day || a.hour - b.hour),
        })
      } else freeFaculty.push(row)
    }
    const byName = (a, b) => String(a.faculty_name || a.uni_id).localeCompare(String(b.faculty_name || b.uni_id))
    freeFaculty.sort(byName); busyFaculty.sort(byName)
  }

  // ── Rooms, from the same file ─────────────────────────────────────────────
  let roomsPayload = null
  if (wantRooms) {
    const { room, excluded, knownRooms } = await buildRoomMaster(dayNums)

    const busyRooms = new Set()
    const unmatched = new Map()
    const occupants = new Map()   // room -> Set of "name (course)"
    for (const e of entries) {
      if (!e.room_no) continue
      const r = resolveRoom(e.room_no, knownRooms)
      if (!r) continue
      busyRooms.add(r)
      if (!room.has(r)) {
        const u = unmatched.get(r) || { raws: new Set(), sample: e.raw || '' }
        u.raws.add(String(e.room_no).trim())
        unmatched.set(r, u)
        continue
      }
      const who = occupants.get(r) || new Set()
      who.add([e.faculty_name || e.uni_id, e.course_code].filter(Boolean).join(' · '))
      occupants.set(r, who)
    }

    const detail = Object.fromEntries(WINGS.map(w => [w, { occupied: [], free: [] }]))
    for (const info of room.values()) {
      const bucket = detail[info.wing]
      if (!bucket) continue
      const row = {
        room: info.room, capacity: info.capacity ?? null, type: info.type || null,
        block: info.block || null, floor: info.floor ?? null,
        wing: info.wing, allotment: info.allotment || info.wing,
        usage: info.usage || {},
        occupants: [...(occupants.get(info.room) || [])].sort(),
      }
      ;(busyRooms.has(info.room) ? bucket.occupied : bucket.free).push(row)
    }
    const byRoomNo = (a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })
    for (const w of WINGS) { detail[w].occupied.sort(byRoomNo); detail[w].free.sort(byRoomNo) }

    roomsPayload = {
      byWing: WINGS.map(w => ({
        wing: w,
        occupied: detail[w].occupied.length,
        free:     detail[w].free.length,
        total:    detail[w].occupied.length + detail[w].free.length,
      })),
      detail,
      masterTotal: knownRooms.size,
      uncategorisedOccupied: unmatched.size,
      excluded: buildExcludedReport(excluded, unmatched),
    }
  }

  res.json({
    success: true,
    days: dayNums,
    periods: periodNums,
    snapshot: snap.label || snap.filename || dataset,
    campus: campus || null,
    faculty: wantFaculty ? {
      free: freeFaculty, busy: busyFaculty,
      totals: {
        roster: roster.length,
        free:   freeFaculty.length,
        busy:   busyFaculty.length,
      },
    } : null,
    rooms: roomsPayload,
    entryCount: entries.length,
  })
}
