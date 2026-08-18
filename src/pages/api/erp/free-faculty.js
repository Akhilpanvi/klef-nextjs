import { requireAuth }     from '@/lib/auth'
import { connectDB }       from '@/lib/mongodb'
import FacultywiseEntry    from '@/lib/models/FacultywiseEntry'
import FacultywiseFaculty  from '@/lib/models/FacultywiseFaculty'
import FacultywiseSnapshot from '@/lib/models/FacultywiseSnapshot'
import User                from '@/lib/models/User'
import { fdProfile, FD_FIELDS } from '@/lib/erpData'

/**
 * Free faculty for a slot, from the ERP Faculty-wise TT.
 *
 * GET /api/erp/free-faculty?days=1&periods=3,4
 *
 * Free means "has no class in any selected slot". That has to start from the
 * roster rather than from the busy rows — a lecturer with an empty week has no
 * entries at all, so counting only what is busy would hide exactly the people
 * being looked for.
 *
 * Department, designation and permissible load come from the FD upload, joined
 * on uni_id === User.eid, so the department filter matches the original page.
 */
const parseList = (raw, max) =>
  [...new Set(String(raw ?? '').split(',').map(Number).filter(n => n >= 1 && n <= max))]
    .sort((a, b) => a - b)

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const dayNums    = parseList(req.query.days ?? req.query.day, 7)
  const periodNums = parseList(req.query.periods, 24)
  if (!dayNums.length || !periodNums.length)
    return res.status(400).json({ success: false, message: 'days and periods required' })

  await connectDB()

  const snap = await FacultywiseSnapshot.findOne().lean()
  if (!snap)
    return res.json({
      success: true, noData: true,
      message: 'No Faculty-wise timetable uploaded yet — add it in Admin.',
    })

  const dataset = snap.snapshotId

  const [busyRows, roster, weekLoad] = await Promise.all([
    FacultywiseEntry.find(
      { dataset, day: { $in: dayNums }, hour: { $in: periodNums } },
      'uni_id day hour room_no course_code component section offering_level degree').lean(),
    FacultywiseFaculty.find({ dataset }, 'uni_id faculty_name campus slotCount').lean(),
    // Weekly load per faculty, aggregated rather than fetched.
    FacultywiseEntry.aggregate([
      { $match: { dataset } },
      { $group: { _id: '$uni_id', slots: { $sum: 1 }, courses: { $addToSet: '$course_code' } } },
    ]),
  ])

  const busyById = new Map()
  for (const e of busyRows) {
    const id = String(e.uni_id || '').trim()
    if (!id) continue
    const hit = busyById.get(id) || []
    hit.push({
      day: e.day, hour: e.hour, room: e.room_no || null,
      course_code: e.course_code || null, component: e.component || null,
      section: e.section || null, year: parseInt(e.offering_level, 10) || null,
    })
    busyById.set(id, hit)
  }

  const loadById = new Map(weekLoad.map(w => [String(w._id || '').trim(), {
    slots: w.slots || 0,
    courses: (w.courses || []).filter(Boolean).length,
  }]))

  const users = await User.find(
    { eid: { $in: roster.map(r => r.uni_id).filter(Boolean) } }, FD_FIELDS).lean()
  const fdByEid = new Map(users.map(u => [String(u.eid).trim(), u]))

  const free = [], busy = []
  for (const r of roster) {
    const id = String(r.uni_id || '').trim()
    const fd = fdProfile(fdByEid.get(id))
    const wk = loadById.get(id)
    const row = {
      id, name: r.faculty_name || fd?.name || null,
      campus: r.campus || null,
      dept: fd?.dept || null,
      designation: fd?.designation || null,
      responsibility: fd?.assigned_responsibility || null,
      cohort: fd?.cohort || null, cohort_name: fd?.cohort_name || null,
      phone: fd?.phone || null, email: fd?.email || null,
      permissibleLoad: fd?.pl ?? null,
      designationLoad: fd?.load_as_per_designation ?? null,
      weeklyLoad: wk?.slots ?? r.slotCount ?? 0,
      weeklyCourses: wk?.courses ?? null,
      hasFd: Boolean(fd),
    }
    const hit = busyById.get(id)
    if (hit) busy.push({ ...row, classes: hit.sort((a, b) => a.day - b.day || a.hour - b.hour) })
    else free.push(row)
  }
  const byName = (a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id))
  free.sort(byName); busy.sort(byName)

  res.json({
    success: true,
    days: dayNums, periods: periodNums,
    snapshot: snap.label || snap.filename || dataset,
    faculty: free,
    busy,
    count: free.length,
    totals: {
      roster: roster.length,
      free: free.length,
      busy: busy.length,
      withoutFd: [...free, ...busy].filter(f => !f.hasFd).length,
    },
  })
}
