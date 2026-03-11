import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'
import RoomMeta from '@/lib/models/RoomMeta'
import { detectClashes } from '@/lib/clashEngine'
import { getActiveDataset } from '@/lib/activeDataset'

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  const user = await requireAuth(req, res)
  if (!user) return

  await connectDB()

  const masterDataset = await getActiveDataset('master')
  const liveDataset   = await getActiveDataset('live')

  const masterCount = await TimetableEntry.countDocuments({ dataset: masterDataset })
  const dataset = masterCount > 0 ? masterDataset : liveDataset

  const count = await TimetableEntry.countDocuments({ dataset })
  if (!count)
    return res.status(400).json({ success: false, message: 'No timetable data loaded' })

  const entries = await TimetableEntry
    .find({ dataset })
    .select('umatdayid umat_hourno room_no emp_id main_sectionno associative_sectionno course_code course_name faculty_name')
    .lean()

  const metas = await RoomMeta.find({}).lean()
  const metaMap = Object.fromEntries(metas.map(m => [m.room_no, m]))

  const clashes = detectClashes(entries, metaMap)

  const stats = {
    total:   clashes.length,
    severe:  clashes.filter(c => c.severity === 'severe').length,
    warn:    clashes.filter(c => c.severity === 'warn').length,
    info:    clashes.filter(c => c.severity === 'info').length,
    dataset,
  }

  res.json({ success: true, stats, clashes })
}
