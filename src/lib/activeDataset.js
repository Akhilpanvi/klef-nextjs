import TimetableSnapshot from './models/TimetableSnapshot'

/**
 * Returns the active dataset ID for the given type.
 * Falls back to 'live' or 'master' for backward compatibility
 * with data uploaded before the snapshot system was introduced.
 */
export async function getActiveDataset(type = 'live') {
  const snap = await TimetableSnapshot.findOne({ type, isActive: true }).lean()
  return snap?.snapshotId || type
}

/**
 * Returns ALL snapshot IDs for a given type (active first, then by date desc).
 */
export async function listSnapshots(type = 'live') {
  return TimetableSnapshot.find({ type }).sort({ uploadedAt: -1 }).lean()
}
