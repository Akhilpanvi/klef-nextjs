import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  dataset:  { type: String, required: true, index: true },
  room_no:  { type: String, required: true, trim: true, index: true },
  source_name: { type: String, required: true, trim: true },
  block:       { type: String, default: null },
  floor:       { type: Number, default: null },
  capacity:    { type: Number, default: null },
  room_type:   { type: String, default: null },
  assigned: { type: String, default: null },
  day_assignments: {
    mon: { type: String, default: null },
    tue: { type: String, default: null },
    wed: { type: String, default: null },
    thu: { type: String, default: null },
    fri: { type: String, default: null },
    sat: { type: String, default: null },
  },
}, { timestamps: true })

schema.index({ dataset: 1, room_no: 1 }, { unique: true })

export default mongoose.models.RoomAssignment || mongoose.model('RoomAssignment', schema)
