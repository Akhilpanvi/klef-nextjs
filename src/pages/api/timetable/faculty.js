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
    return res.json({ success: true, faculty: faculty.map(f => ({ id: f._id, name: f.name, dept: f.dept })) })
  }

  if (!q) return res.status(400).json({ success: false, message: 'q param required' })

  // Fetch ALL entries (no hour cap) — frontend decides what to show
  const filter = {
    dataset,
    $or: [
      { emp_id: q.trim() },
      { faculty_name: { $regex: q.trim(), $options: 'i' } },
    ],
  }

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

  // Build a map: "day|hour|sec|course" → sorted list of associates
  const slotMap = {}
  for (const e of allSlotEntries) {
    const key = `${e.umatdayid}|${e.umat_hourno}|${e.main_sectionno}|${e.course_code}`
    if (!slotMap[key]) slotMap[key] = []
    slotMap[key].push({ empId: e.emp_id, name: e.faculty_name, label: e.associative_sectionno, seq: e.faculty_seq })
  }

  // Attach associates (all other faculty in the same slot) to each entry
  const enrichedEntries = entries.map(e => {
    const key = `${e.umatdayid}|${e.umat_hourno}|${e.main_sectionno}|${e.course_code}`
    const all = slotMap[key] || []
    const associates = all
      .filter(a => a.empId !== e.emp_id)
      .sort((a, b) => (a.seq || 99) - (b.seq || 99))
    return { ...e, associates }
  })

  // Lookup User profile for rich profile card display
  const profile = empId
    ? await User.findOne({ eid: empId }).select('designation cohort designation_category assigned_responsibility load_as_per_designation pl').lean()
    : null

  res.json({
    success: true,
    faculty: {
      id:   empId,
      name: entries[0].faculty_name,
      dept: entries[0].faculty_dept,
      weeklyLoad,
      extraLoad,
      designation:             profile?.designation,
      cohort:                  profile?.cohort,
      designation_category:    profile?.designation_category,
      assigned_responsibility: profile?.assigned_responsibility,
      load_as_per_designation: profile?.load_as_per_designation,
      pl:                      profile?.pl,
    },
    entries: enrichedEntries,
    snapshot: dataset,
  })
}
