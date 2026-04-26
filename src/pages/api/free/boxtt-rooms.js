import { requireAuth } from '@/lib/auth'
import { connectDB }   from '@/lib/mongodb'
import BoxTTEntry      from '@/lib/models/BoxTTEntry'
import BoxTTSnapshot   from '@/lib/models/BoxTTSnapshot'

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  await connectDB()

  const snap = await BoxTTSnapshot.findOne().lean()
  if (!snap) return res.json({ success: true, active: false, rooms: [] })

  const rooms = await BoxTTEntry.distinct('room_no', { dataset: snap.snapshotId })
  rooms.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  res.json({ success: true, active: true, rooms })
}
