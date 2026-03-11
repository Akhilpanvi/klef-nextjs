import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'
import TimetableSnapshot from '@/lib/models/TimetableSnapshot'

export default async function handler(req, res) {
  const user = await requireAuth(req, res)
  if (!user) return

  await connectDB()

  // GET — list all snapshots
  if (req.method === 'GET') {
    const snapshots = await TimetableSnapshot.find({}).sort({ uploadedAt: -1 }).lean()
    return res.json({ success: true, snapshots })
  }

  // Admin-only below
  if (user.role !== 'admin')
    return res.status(403).json({ success: false, message: 'Admin required' })

  // PATCH — set a snapshot as active
  if (req.method === 'PATCH') {
    const { snapshotId } = req.body || {}
    if (!snapshotId) return res.status(400).json({ success: false, message: 'snapshotId required' })

    const snap = await TimetableSnapshot.findOne({ snapshotId })
    if (!snap) return res.status(404).json({ success: false, message: 'Snapshot not found' })

    await TimetableSnapshot.updateMany({ type: snap.type, isActive: true }, { $set: { isActive: false } })
    snap.isActive = true
    await snap.save()

    return res.json({ success: true, message: `"${snap.label}" is now active` })
  }

  // DELETE — remove a snapshot and its entries
  if (req.method === 'DELETE') {
    const { snapshotId } = req.query
    if (!snapshotId) return res.status(400).json({ success: false, message: 'snapshotId required' })

    const snap = await TimetableSnapshot.findOne({ snapshotId })
    if (!snap) return res.status(404).json({ success: false, message: 'Snapshot not found' })
    if (snap.isActive) return res.status(400).json({ success: false, message: 'Cannot delete the active version. Activate another first.' })

    const { deletedCount } = await TimetableEntry.deleteMany({ dataset: snapshotId })
    await TimetableSnapshot.deleteOne({ snapshotId })

    return res.json({ success: true, message: `Deleted "${snap.label}" (${deletedCount} entries)` })
  }

  res.status(405).json({ success: false, message: 'Method not allowed' })
}
