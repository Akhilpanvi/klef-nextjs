import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  const user = await requireAuth(req, res)
  if (!user) return

  const { day, periods } = req.query
  if (!day || !periods)
    return res.status(400).json({ success: false, message: 'day and periods required' })

  await connectDB()

  const dayNum     = parseInt(day)
  const periodNums = periods.split(',').map(Number).filter(p => p >= 1 && p <= 24)
  if (!periodNums.length)
    return res.status(400).json({ success: false, message: 'No valid periods' })

  // Morning/evening constraint from original app
  const morning = [1, 2], evening = [10, 11]
  const extended = new Set(periodNums)
  if (periodNums.some(p => evening.includes(p))) morning.forEach(p => extended.add(p))
  if (periodNums.some(p => morning.includes(p))) evening.forEach(p => extended.add(p))

  const busyIds = await TimetableEntry.distinct('emp_id', {
    dataset: 'live',
    umatdayid: dayNum,
    umat_hourno: { $in: [...extended] },
  })
  const busySet = new Set(busyIds.map(String))

  // All faculty
  const all = await TimetableEntry.aggregate([
    { $match: { dataset: 'live', emp_id: { $ne: null } } },
    { $group: {
        _id: '$emp_id',
        name: { $first: '$faculty_name' },
        dept: { $first: '$faculty_dept' },
      }
    },
  ])

  // Weekly load
  const loads = await TimetableEntry.aggregate([
    { $match: { dataset: 'live', emp_id: { $ne: null } } },
    { $group: { _id: '$emp_id', load: { $sum: 1 } } },
  ])
  const loadMap = Object.fromEntries(loads.map(l => [l._id, l.load]))

  const free = all
    .filter(f => f._id && !busySet.has(f._id))
    .map(f => ({ id: f._id, name: f.name, dept: f.dept, weeklyLoad: loadMap[f._id] || 0 }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))

  res.json({ success: true, count: free.length, faculty: free })
}
