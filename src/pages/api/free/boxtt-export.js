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
  if (!snap) return res.status(404).json({ success: false, message: 'No Box TT data uploaded' })

  const entries = await BoxTTEntry.find(
    { dataset: snap.snapshotId },
    'room_no day hour label'
  ).lean()

  res.json({ success: true, label: snap.label, entries })
}
