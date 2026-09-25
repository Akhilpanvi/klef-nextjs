import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  key:            { type: String, required: true, unique: true, default: 'active' },
  dataset:        { type: String, required: true },
  filename:       { type: String, required: true },
  matchedCount:   { type: Number, required: true },
  roomCount:      { type: Number, required: true },
  duplicateCount: { type: Number, default: 0 },
  missingRooms:   [{ type: String }],
  unmatchedRooms: [{ type: String }],
  uploadedAt:     { type: Date, default: Date.now },
})

export default mongoose.models.RoomAssignmentSnapshot ||
  mongoose.model('RoomAssignmentSnapshot', schema)
