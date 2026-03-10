import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'
import RoomMeta from '@/lib/models/RoomMeta'

export default async function handler(req, res) {
  await connectDB()

  if (req.method === 'GET') {
    const user = await requireAuth(req, res)
    if (!user) return

    const [live, master, rooms] = await Promise.all([
      TimetableEntry.countDocuments({ dataset: 'live' }),
      TimetableEntry.countDocuments({ dataset: 'master' }),
      RoomMeta.countDocuments(),
    ])
    return res.json({ success: true, status: { live, master, rooms, hasData: live > 0 } })
  }

  if (req.method === 'DELETE') {
    const user = await requireAuth(req, res, 'admin')
    if (!user) return

    const { dataset } = req.query
    if (!['live', 'master', 'all'].includes(dataset))
      return res.status(400).json({ success: false, message: 'dataset must be live | master | all' })

    if (dataset === 'all') {
      const [r1, r2] = await Promise.all([
        TimetableEntry.deleteMany({}),
        RoomMeta.deleteMany({}),
      ])
      return res.json({ success: true, message: `Cleared ${r1.deletedCount} timetable + ${r2.deletedCount} room entries` })
    }

    const r = await TimetableEntry.deleteMany({ dataset })
    return res.json({ success: true, message: `Cleared ${r.deletedCount} ${dataset} entries` })
  }

  res.status(405).json({ success: false, message: 'Method not allowed' })
}
