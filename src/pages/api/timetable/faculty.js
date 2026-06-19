import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'
import User from '@/lib/models/User'
import { getActiveDataset } from '@/lib/activeDataset'

const MAX_HOUR = 11  // Faculty view capped at period 11; admin sees all

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  const user = await requireAuth(req, res)
  if (!user) return

  await connectDB()
  const { q, list, snap } = req.query

  const dataset = snap || await getActiveDataset('live')

  // /api/timetable/faculty?list=1  → all faculty for autocomplete (capped at ≤11)
  if (list) {
    const faculty = await TimetableEntry.aggregate([
      { $match: { dataset, emp_id: { $ne: null }, umat_hourno: { $lte: MAX_HOUR } } },
      { $group: {
          _id: '$emp_id',
          name:  { $first: '$faculty_name' },
          dept:  { $first: '$faculty_dept' },
        }
      },
      { $sort: { _id: 1 } },
    ])

    // Fill in names/dept from User accounts for entries where faculty_name is null (GSheet data)
    const nullIds = faculty.filter(f => !f.name).map(f => f._id)
    if (nullIds.length) {
      const users = await User.find({ eid: { $in: nullIds } }, 'eid display_name dept').lean()
      const userMap = {}
      users.forEach(u => { if (u.eid) userMap[u.eid] = u })
      faculty.forEach(f => {
        if (!f.name && userMap[f._id]) {
          f.name = userMap[f._id].display_name || null
          if (!f.dept) f.dept = userMap[f._id].dept || null
        }
      })
    }

    return res.json({ success: true, faculty: faculty.map(f => ({ id: f._id, name: f.name, dept: f.dept })) })
  }

  if (!q) return res.status(400).json({ success: false, message: 'q param required' })

  // If q looks like a name (not a numeric emp_id), also resolve it via User accounts
  // so searches work on GSheet data where faculty_name is null
  let extraEmpIds = []
  if (!/^\d+$/.test(q.trim())) {
    const matchedUsers = await User.find(
      { display_name: { $regex: q.trim(), $options: 'i' } },
      'eid'
    ).lean()
    extraEmpIds = matchedUsers.map(u => u.eid).filter(Boolean)
  }

  const orClauses = [
    { emp_id: q.trim() },
    { faculty_name: { $regex: q.trim(), $options: 'i' } },
  ]
  if (extraEmpIds.length) orClauses.push({ emp_id: { $in: extraEmpIds } })

  const filter = { dataset, $or: orClauses }

  const entries = await TimetableEntry.find(filter).lean()
  if (!entries.length)
    return res.status(404).json({ success: false, message: 'Faculty not found' })

  const empId = entries[0].emp_id

  // Weekly load = periods 1–11 only
  const weeklyLoad = entries.filter(e => e.umat_hourno <= MAX_HOUR).length
  // Extra load = periods beyond 11
  const extraLoad  = entries.filter(e => e.umat_hourno >  MAX_HOUR).length

  // Fetch all other faculty sharing the same slots (for MA/A/B/C display)
  const slotConditions = entries.map(e => ({
    umatdayid:      e.umatdayid,
    umat_hourno:    e.umat_hourno,
    main_sectionno: e.main_sectionno,
    course_code:    e.course_code,
  }))
  const allSlotEntries = await TimetableEntry.find({ dataset, $or: slotConditions })
    .select('umatdayid umat_hourno main_sectionno course_code emp_id faculty_name associative_sectionno faculty_seq')
    .lean()

  // Batch-fetch User accounts for all emp_ids that appear in this response
  const allEmpIds = [...new Set([
    ...entries.map(e => e.emp_id),
    ...allSlotEntries.map(e => e.emp_id),
  ].filter(Boolean))]

  const userDocs = await User.find(
    { eid: { $in: allEmpIds } },
    'eid display_name dept designation phone email cohort cohort_name designation_category assigned_responsibility load_as_per_designation pl'
  ).lean()
  const userMap = {}
  userDocs.forEach(u => { if (u.eid) userMap[u.eid] = u })

  const profile = empId ? userMap[empId] : null

  // Build a map: "day|hour|sec|course" → sorted list of associates
  const slotMap = {}
  for (const e of allSlotEntries) {
    const key = `${e.umatdayid}|${e.umat_hourno}|${e.main_sectionno}|${e.course_code}`
    if (!slotMap[key]) slotMap[key] = []
    slotMap[key].push({
      empId: e.emp_id,
      name:  e.faculty_name || userMap[e.emp_id]?.display_name || null,
      label: e.associative_sectionno,
      seq:   e.faculty_seq,
    })
  }

  // Attach associates to each entry
  const enrichedEntries = entries.map(e => {
    const key = `${e.umatdayid}|${e.umat_hourno}|${e.main_sectionno}|${e.course_code}`
    const all = slotMap[key] || []
    const associates = all
      .filter(a => a.empId !== e.emp_id)
      .sort((a, b) => (a.seq || 99) - (b.seq || 99))
    return { ...e, associates }
  })

  // Resolved name/dept: prefer TimetableEntry, fall back to User account
  const facultyName = entries[0].faculty_name || profile?.display_name || null
  const facultyDept = entries[0].faculty_dept || profile?.dept || null

  res.json({
    success: true,
    faculty: {
      id:   empId,
      name: facultyName,
      dept: facultyDept,
      weeklyLoad,
      extraLoad,
      designation:             profile?.designation,
      phone:                   profile?.phone,
      email:                   profile?.email,
      cohort:                  profile?.cohort,
      cohort_name:             profile?.cohort_name,
      designation_category:    profile?.designation_category,
      assigned_responsibility: profile?.assigned_responsibility,
      load_as_per_designation: profile?.load_as_per_designation,
      pl:                      profile?.pl,
    },
    entries: enrichedEntries,
    snapshot: dataset,
  })
}
