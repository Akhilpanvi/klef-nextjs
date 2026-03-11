import mongoose from 'mongoose'

/**
 * TimetableSnapshot
 * Records every BTT CSV upload as a versioned snapshot.
 * TimetableEntry.dataset stores the snapshotId of the version it belongs to.
 */
const schema = new mongoose.Schema({
  label:      { type: String, required: true },   // human-readable e.g. "BTT-20250115 (15 Jan 2025 14:30)"
  filename:   { type: String },                    // original CSV filename
  type:       { type: String, enum: ['live', 'master'], required: true },
  snapshotId: { type: String, required: true, unique: true }, // e.g. "live_1705312800000"
  rowCount:   { type: Number, default: 0 },
  isActive:   { type: Boolean, default: false },
  uploadedAt: { type: Date, default: Date.now },
}, { timestamps: false })

schema.index({ type: 1, isActive: 1 })
schema.index({ type: 1, uploadedAt: -1 })

export default mongoose.models.TimetableSnapshot ||
  mongoose.model('TimetableSnapshot', schema)
