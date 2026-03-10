import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  const user = await requireAuth(req, res)
  if (!user) return

  await connectDB()
  const { q, list } = req.query

  // /api/timetable/faculty?list=1  → all faculty for autocomplete
  if (list) {
    const faculty = await TimetableEntry.aggregate([
      { $match: { dataset: 'live', emp_id: { $ne: null } } },
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

  const filter = {
    dataset: 'live',
    $or: [
      { emp_id: q.trim() },
      { faculty_name: { $regex: q.trim(), $options: 'i' } },
    ],
  }

  const entries = await TimetableEntry.find(filter).lean()
  if (!entries.length)
    return res.status(404).json({ success: false, message: 'Faculty not found' })

  // Weekly load = hours 1–24 but we count each distinct slot row
  const weeklyLoad = entries.filter(e => e.umat_hourno >= 1 && e.umat_hourno <= 24).length

  res.json({
    success: true,
    faculty: {
      id:   entries[0].emp_id,
      name: entries[0].faculty_name,
      dept: entries[0].faculty_dept,
      weeklyLoad,
    },
    entries,
  })
}
