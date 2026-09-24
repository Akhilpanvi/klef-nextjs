import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import RoomwiseEntry from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot from '@/lib/models/RoomwiseSnapshot'
import { buildBlockUtilization } from '@/lib/blockUtilization'

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  const user = await requireAuth(req, res)
  if (!user) return

  try {
    await connectDB()
    const snapshot = await RoomwiseSnapshot.findOne().lean()
    if (!snapshot) return res.json({ success: true, noData: true, blocks: [],
      message: 'No Roomwise Timetable CSV uploaded. Upload it in Admin to view block-wise utilization.' })

    const dataset = snapshot.snapshotId
    const [entries, observedRooms] = await Promise.all([
      RoomwiseEntry.find({ dataset, day: { $gte: 1, $lte: 6 }, hour: { $gte: 1, $lte: 11 } }, 'room_no day hour').lean(),
      // Include rooms with bookings outside periods 1–11 in the coverage set.
      // Sparse storage cannot establish whether a completely absent room is free.
      RoomwiseEntry.distinct('room_no', { dataset }),
    ])
    res.setHeader('Cache-Control', 'private, no-store')
    return res.json({ success: true, ...buildBlockUtilization(entries, observedRooms),
      snapshotLabel: snapshot.label, filename: snapshot.filename, uploadedAt: snapshot.uploadedAt,
      dataset, source: 'roomwise',
    })
  } catch {
    return res.status(500).json({ success: false, message: 'Unable to load block utilization. Please try again.' })
  }
}
