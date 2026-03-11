import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'
import RoomMeta from '@/lib/models/RoomMeta'
import { getActiveDataset } from '@/lib/activeDataset'

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  const user = await requireAuth(req, res)
  if (!user) return

  const { day, periods } = req.query
  if (!day || !periods)
    return res.status(400).json({ success: false, message: 'day and periods required' })

  await connectDB()
  const dataset = await getActiveDataset('live')

  const dayNum     = parseInt(day)
  const periodNums = periods.split(',').map(Number).filter(p => p >= 1 && p <= 24)

  const busyRooms = await TimetableEntry.distinct('room_no', {
    dataset, umatdayid: dayNum, umat_hourno: { $in: periodNums },
  })
  const busySet = new Set(busyRooms.map(String))

  const allRooms = await TimetableEntry.distinct('room_no', { dataset })
  const metas    = await RoomMeta.find({}).lean()
  const metaMap  = Object.fromEntries(metas.map(m => [m.room_no, m]))

  const free = allRooms
    .filter(r => r && !busySet.has(r))
    .map(r => ({
      number: r, type: metaMap[r]?.room_type||'-', capacity: metaMap[r]?.capacity||null,
      block: metaMap[r]?.block || r.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || '?',
    }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))

  res.json({ success: true, count: free.length, rooms: free })
}
