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

  await connectDB()
  const { q, list, snap } = req.query
  const dataset = snap || await getActiveDataset('live')

  if (list) {
    const rooms  = await TimetableEntry.distinct('room_no', { dataset })
    const metas  = await RoomMeta.find({ room_no: { $in: rooms } }).lean()
    const metaMap = Object.fromEntries(metas.map(m => [m.room_no, m]))
    return res.json({
      success: true,
      rooms: rooms.filter(Boolean).sort().map(r => ({
        number: r,
        block: metaMap[r]?.block || r.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || '?',
        type:  metaMap[r]?.room_type || '-',
        capacity: metaMap[r]?.capacity || null,
      })),
    })
  }

  if (!q) return res.status(400).json({ success: false, message: 'q param required' })

  const entries = await TimetableEntry
    .find({ dataset, room_no: { $regex: `^${q.trim()}$`, $options: 'i' } })
    .lean()

  if (!entries.length)
    return res.status(404).json({ success: false, message: 'Room not found' })

  const meta = await RoomMeta.findOne({ room_no: entries[0].room_no }).lean()

  res.json({
    success: true,
    room: { number: entries[0].room_no, type: meta?.room_type||'-', capacity: meta?.capacity||'-', block: meta?.block||'-' },
    entries,
  })
}
