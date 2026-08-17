import mongoose from 'mongoose'

/**
 * FacultywiseSnapshot
 * Tracks the active Faculty-wise TT upload. One document at a time, cleared
 * and replaced on each upload, mirroring RoomwiseSnapshot.
 */
const schema = new mongoose.Schema({
  snapshotId:   { type: String, required: true, unique: true },
  label:        { type: String },
  filename:     { type: String },
  rowCount:     { type: Number, default: 0 },
  facultyCount: { type: Number, default: 0 },
  uploadedAt:   { type: Date, default: Date.now },
})

export default mongoose.models.FacultywiseSnapshot ||
  mongoose.model('FacultywiseSnapshot', schema)
