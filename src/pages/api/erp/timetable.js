import { requireAuth }    from '@/lib/auth'
import { connectDB }      from '@/lib/mongodb'
import FacultywiseFaculty from '@/lib/models/FacultywiseFaculty'
import FacultywiseEntry   from '@/lib/models/FacultywiseEntry'
import RoomwiseEntry      from '@/lib/models/RoomwiseEntry'
import User               from '@/lib/models/User'
import { loadErpEntries, loadErpSnapshots, fdProfile, FD_FIELDS } from '@/lib/erpData'
import { parseLabel, normalizeProgram } from '@/lib/roomLabel'
import { detectClashes }  from '@/lib/clashEngine'
import { buildRoomMaster } from '@/lib/roomMaster'

/**
 * ERP timetable for one faculty or one room.
 *
 * GET /api/erp/timetable?type=faculty&q=2137
 * GET /api/erp/timetable?type=room&q=C207
 * GET /api/erp/timetable?type=course&q=25CS2101
 * GET /api/erp/timetable?list=faculty            (roster for the search box)
 * GET /api/erp/timetable?list=courses            (course list for the search box)
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

  if (req.query.list === 'courses') {
    // Just the picker list, so this deliberately avoids the full week merge:
    // one aggregation over the faculty-wise rows, plus the room-wise DISTINCT
    // labels (a few thousand) rather than all of its rows.
    const byCode = new Map()
    const put = (code, patch) => {
      if (!code) return
      const k = code.toUpperCase()
      const c = byCode.get(k) || {
        code: k, slots: 0, sections: new Set(), programs: new Set(),
        years: new Set(), faculty: new Set(),
      }
      c.slots += patch.slots || 0
      for (const v of patch.sections || []) if (v != null && v !== '') c.sections.add(String(v))
      for (const v of patch.programs || []) if (v) c.programs.add(v)
      for (const v of patch.years    || []) if (v) c.years.add(v)
      for (const v of patch.faculty  || []) if (v) c.faculty.add(v)
      byCode.set(k, c)
    }

    if (fwSnap) {
      const agg = await FacultywiseEntry.aggregate([
        { $match: { dataset: fwSnap.snapshotId } },
        { $group: {
          _id: { $toUpper: '$course_code' },
          slots:    { $sum: 1 },
          sections: { $addToSet: '$section' },
          faculty:  { $addToSet: '$uni_id' },
          degrees:  { $addToSet: '$degree' },
          years:    { $addToSet: '$offering_level' },
        } },
      ])
      for (const a of agg) put(a._id, {
        slots: a.slots, sections: a.sections, faculty: a.faculty,
        programs: (a.degrees || []).map(d => normalizeProgram(d || '')).filter(Boolean),
        years: (a.years || []).map(y => parseInt(y, 10)).filter(Boolean),
      })
    }
    if (rwSnap) {
      const labels = await RoomwiseEntry.distinct('label', { dataset: rwSnap.snapshotId })
      for (const l of labels) {
        const p = parseLabel(l)
        if (!p) continue
        // Codes seen only here have no faculty attached; slots are not counted
        // from labels because one label covers many rows.
        put(p.course_code, {
          sections: [p.section], programs: [p.program], years: [p.year],
        })
      }
    }

    return res.json({
      success: true,
      courses: [...byCode.values()]
        .map(c => ({
          code: c.code, slots: c.slots,
          sections: c.sections.size, faculty: c.faculty.size,
          programs: [...c.programs].sort(),
          years: [...c.years].sort((a, b) => a - b),
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
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
  } else if (type === 'course') {
    const want = q.toUpperCase().trim()
    match = entries.filter(e => (e.course_code || '').toUpperCase() === want)
    title = want
    const programs = [...new Set(match.map(e => e.program).filter(Boolean))].sort()
    const years    = [...new Set(match.map(e => e.year).filter(Boolean))].sort((a, b) => a - b)
    subtitle = [
      programs.length ? programs.join(', ') : null,
      years.length ? `Year ${years.join(', ')}` : null,
    ].filter(Boolean).join(' · ')
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
      message: `No ERP timetable rows for ${type} "${q}".`,
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
  const codes = new Set(match.map(m => m.course_code).filter(Boolean))
  const clashes = type === 'room'
    ? allClashes.filter(c => (c.room || '').toUpperCase() === title)
    : type === 'course'
      // A course's clashes are the ones in its own rooms and periods, or that
      // name the course on either side of the overlap.
      ? allClashes.filter(c =>
        own.has(`${c.day}|${c.hour}|${(c.room || '').toUpperCase()}`) ||
        codes.has(c.courseCode1) || codes.has(c.courseCode2))
      : allClashes.filter(c =>
        own.has(`${c.day}|${c.hour}|${(c.room || '').toUpperCase()}`) ||
        names.has(c.faculty1) || names.has(c.faculty2))

  // Per section and delivery component: who teaches it, where, how often.
  // A course can run 40-plus sections, so this is the readable summary the
  // week grid cannot be.
  let sections = null
  if (type === 'course') {
    const bySec = new Map()
    for (const e of match) {
      const key = `${e.main_sectionno ?? '—'}|${e.coursedeliverycomponent ?? ''}`
      const row = bySec.get(key) || {
        section: e.main_sectionno ?? '—',
        component: e.coursedeliverycomponent ?? null,
        program: e.program || null, year: e.year || null,
        slots: 0, faculty: new Map(), rooms: new Set(), days: new Set(),
      }
      row.slots++
      if (e.emp_id) row.faculty.set(e.emp_id, e.faculty_name || null)
      if (e.room_no) row.rooms.add(e.room_no)
      if (e.umatdayid) row.days.add(e.umatdayid)
      bySec.set(key, row)
    }
    sections = [...bySec.values()]
      .map(r => ({
        ...r,
        faculty: [...r.faculty.entries()].map(([id, name]) => ({ id, name })),
        rooms: [...r.rooms].sort(),
        days: [...r.days].sort((a, b) => a - b),
      }))
      .sort((a, b) =>
        String(a.section).localeCompare(String(b.section), undefined, { numeric: true }) ||
        (a.component || 0) - (b.component || 0))
  }

  // Load measured from the ERP grid itself.
  const distinct = (arr) => [...new Set(arr.filter(Boolean))].length
  res.json({
    success: true, found: true,
    type, title, subtitle, profile,
    entries: match.sort((a, b) => a.umatdayid - b.umatdayid || a.umat_hourno - b.umat_hourno),
    clashes,
    sections,
    load: {
      slots: match.length,
      courses: distinct(match.map(e => e.course_code)),
      rooms:   distinct(match.map(e => e.room_no)),
      days:    distinct(match.map(e => e.umatdayid)),
      sections: distinct(match.map(e => e.main_sectionno)),
      faculty:  distinct(match.map(e => e.emp_id)),
      programs: distinct(match.map(e => e.program)),
      years:    distinct(match.map(e => e.year)),
    },
    sources, counts, unparsed,
  })
}
