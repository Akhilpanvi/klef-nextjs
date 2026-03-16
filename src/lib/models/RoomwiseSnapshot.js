import mongoose from 'mongoose'

/**
 * RoomwiseSnapshot
 * ────────────────
 * Tracks the currently active Roomwise-TT upload.
 * Completely standalone — no relation to TimetableSnapshot.
 * Only ONE document exists at a time (cleared and replaced on each upload).
 */
const schema = new mongoose.Schema({
  snapshotId: { type: String, required: true, unique: true },
  label:      { type: String },
  filename:   { type: String },
  rowCount:   { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now },
})

export default mongoose.models.RoomwiseSnapshot ||
  mongoose.model('RoomwiseSnapshot', schema)
