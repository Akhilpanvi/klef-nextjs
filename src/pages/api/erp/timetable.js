import { requireAuth }    from '@/lib/auth'
import { connectDB }      from '@/lib/mongodb'
import FacultywiseFaculty from '@/lib/models/FacultywiseFaculty'
import User               from '@/lib/models/User'
import { loadErpEntries, loadErpSnapshots, fdProfile, FD_FIELDS } from '@/lib/erpData'
import { detectClashes }  from '@/lib/clashEngine'
import { buildRoomMaster } from '@/lib/roomMaster'

/**
 * ERP timetable for one faculty or one room.
 *
 * GET /api/erp/timetable?type=faculty&q=2137
 * GET /api/erp/timetable?type=room&q=C207
 * GET /api/erp/timetable?list=faculty            (roster for the search box)
 *
 * Built only from the two ERP uploads. Faculty details come from the FD
 * upload, joined on uni_id === User.eid.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  await connectDB()
  const snapshots = await loadErpSnapshots()
  const { rwSnap, fwSnap } = snapshots

  if (!rwSnap && !fwSnap)
    return res.json({
      success: true, noData: true,
      message: 'No ERP data yet — upload the Room-wise and Faculty-wise timetables in Admin.',
    })

  // ── Roster for the search box ────────────────────────────────────────────
  if (req.query.list === 'faculty') {
    if (!fwSnap) return res.json({ success: true, faculty: [] })
    const roster = await FacultywiseFaculty
      .find({ dataset: fwSnap.snapshotId }, 'uni_id faculty_name campus slotCount').lean()
    const users = await User.find(
      { eid: { $in: roster.map(r => r.uni_id).filter(Boolean) } }, 'eid dept designation').lean()
    const byEid = new Map(users.map(u => [String(u.eid).trim(), u]))
    return res.json({
      success: true,
      faculty: roster
        .map(r => {
          const u = byEid.get(String(r.uni_id).trim())
          return {
            id: r.uni_id, name: r.faculty_name || null,
            dept: u?.dept || null, designation: u?.designation || null,
            weekSlots: r.slotCount || 0,
          }
        })
        .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id))),
    })
  }

  const type = (req.query.type || 'faculty').toLowerCase()
  const q    = String(req.query.q || '').trim()
  if (!q) return res.status(400).json({ success: false, message: 'q required' })

  // Whole week: the grid shows every day, and clashes are per slot.
  const { entries, sources, counts, unparsed } = await loadErpEntries({ snapshots })

  let match, profile = null, title = q, subtitle = null
  if (type === 'room') {
    const want = q.toUpperCase().replace(/\s+/g, '')
    match = entries.filter(e => (e.room_no || '').toUpperCase().replace(/\s+/g, '') === want)
    const { room } = await buildRoomMaster([1, 2, 3, 4, 5, 6])
    const info = room.get(want)
    if (info) {
      subtitle = [
        info.wing && `Wing ${info.wing}`,
        info.type, info.capacity != null && `${info.capacity} seats`,
        info.block && `Block ${info.block}`,
      ].filter(Boolean).join(' · ')
    }
    title = want
  } else {
    const lower = q.toLowerCase()
    match = entries.filter(e =>
      String(e.emp_id || '') === q ||
      (e.faculty_name || '').toLowerCase().includes(lower))
    const eid = match.find(e => e.emp_id)?.emp_id
    if (eid) {
      const u = await User.findOne({ eid: String(eid).trim() }, FD_FIELDS).lean()
      profile = fdProfile(u)
      title = match.find(e => e.faculty_name)?.faculty_name || q
      subtitle = eid ? `Emp No ${eid}` : null
    }
  }

  if (!match.length)
    return res.json({
      success: true, found: false,
      message: `No ERP timetable rows for ${type === 'room' ? 'room' : 'faculty'} "${q}".`,
      sources,
    })

  // Clashes limited to the slots this faculty/room actually occupies, so the
  // grid can mark them without running the whole-institution pass.
  const slots = new Set(match.map(e => `${e.umatdayid}|${e.umat_hourno}`))
  const scoped = entries.filter(e => slots.has(`${e.umatdayid}|${e.umat_hourno}`))
  const { room: roomMaster } = await buildRoomMaster([1, 2, 3, 4, 5, 6])
  const metaMap = Object.fromEntries(
    [...roomMaster.values()].map(r => [r.room, { room_type: r.type, capacity: r.capacity }]))
  const allClashes = detectClashes(scoped, metaMap)
  // Only clashes this faculty/room is actually part of. Matching on the slot
  // alone would return every clash happening anywhere at that hour.
  const own = new Set(match.map(m => `${m.umatdayid}|${m.umat_hourno}|${(m.room_no || '').toUpperCase()}`))
  const names = new Set(match.map(m => m.faculty_name).filter(Boolean))
  const clashes = type === 'room'
    ? allClashes.filter(c => (c.room || '').toUpperCase() === title)
    : allClashes.filter(c =>
      own.has(`${c.day}|${c.hour}|${(c.room || '').toUpperCase()}`) ||
      names.has(c.faculty1) || names.has(c.faculty2))

  // Load measured from the ERP grid itself.
  const distinct = (arr) => [...new Set(arr.filter(Boolean))].length
  res.json({
    success: true, found: true,
    type, title, subtitle, profile,
    entries: match.sort((a, b) => a.umatdayid - b.umatdayid || a.umat_hourno - b.umat_hourno),
    clashes,
    load: {
      slots: match.length,
      courses: distinct(match.map(e => e.course_code)),
      rooms:   distinct(match.map(e => e.room_no)),
      days:    distinct(match.map(e => e.umatdayid)),
      sections: distinct(match.map(e => e.main_sectionno)),
      faculty:  distinct(match.map(e => e.emp_id)),
    },
    sources, counts, unparsed,
  })
}
