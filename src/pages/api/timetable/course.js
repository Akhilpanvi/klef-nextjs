import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'
import { getActiveDataset } from '@/lib/activeDataset'

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  const user = await requireAuth(req, res)
  if (!user) return

  await connectDB()
  const { q, year, list, reg, snap } = req.query
  const dataset = snap || await getActiveDataset('live')

  if (list) {
    const match = { dataset, course_code: { $ne: null } }
    if (year) match.year = +year
    if (reg)  match.reg  = reg
    const courses = await TimetableEntry.aggregate([
      { $match: match },
      { $group: { _id: { code: '$course_code', year: '$year' }, name: { $first: '$course_name' }, reg: { $first: '$reg' } } },
      { $sort: { '_id.year': 1, '_id.code': 1 } },
    ])
    return res.json({ success: true, courses: courses.map(c => ({ code: c._id.code, name: c.name, year: c._id.year, reg: c.reg })) })
  }

  if (!q || !year)
    return res.status(400).json({ success: false, message: 'q and year params required' })

  const match = { dataset, year: +year }
  if (reg) match.reg = reg

  const entries = await TimetableEntry.find({
    ...match,
    $or: [
      { course_code: { $regex: q.trim(), $options: 'i' } },
      { course_name: { $regex: q.trim(), $options: 'i' } },
    ],
  }).lean()

  if (!entries.length)
    return res.status(404).json({ success: false, message: 'Course not found for given year' })

  res.json({ success: true, course: { code: entries[0].course_code, name: entries[0].course_name, year: entries[0].year }, entries })
}
