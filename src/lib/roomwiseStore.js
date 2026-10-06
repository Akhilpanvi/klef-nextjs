import RoomwiseEntry    from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot from '@/lib/models/RoomwiseSnapshot'

/**
 * roomwiseStore
 * ─────────────
 * Replaces the active Roomwise-TT snapshot. Shared by the manual CSV upload
 * and the direct ERP fetch so both leave the database in the same shape.
 * Call connectDB() first.
 */

export function makeSnapshotId() {
  return `roomwise_${Date.now()}`
}

export function makeLabel(filename) {
  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const base    = filename ? filename.replace(/\.[^.]+$/, '') : 'Roomwise-TT'
  return `${base} (${dateStr} ${timeStr})`
}

/** Clears the previous snapshot, inserts docs, records the new snapshot. */
export async function replaceRoomwiseSnapshot({ docs, snapshotId, filename }) {
  const prevSnap = await RoomwiseSnapshot.findOne().lean()
  if (prevSnap) {
    await RoomwiseEntry.deleteMany({ dataset: prevSnap.snapshotId })
    await RoomwiseSnapshot.deleteMany({})
  }

  const CHUNK  = 1000
  let inserted = 0
  for (let i = 0; i < docs.length; i += CHUNK) {
    await RoomwiseEntry.insertMany(docs.slice(i, i + CHUNK), { ordered: false })
    inserted += Math.min(CHUNK, docs.length - i)
  }

  const label = makeLabel(filename)
  await RoomwiseSnapshot.create({ snapshotId, label, filename, rowCount: inserted })
  return { inserted, label }
}
