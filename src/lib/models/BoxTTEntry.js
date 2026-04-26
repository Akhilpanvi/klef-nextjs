import mongoose from 'mongoose'

const schema = new mongoose.Schema(
  {
    room_no:  { type: String, required: true, trim: true, index: true },
    dataset:  { type: String, required: true, index: true },
    day:      { type: Number, required: true, min: 1, max: 6, index: true },
    hour:     { type: Number, required: true, min: 1, max: 11, index: true },
    label:    { type: String, trim: true },
  },
  { timestamps: false }
)

schema.index({ dataset: 1, room_no: 1 })
schema.index({ dataset: 1, room_no: 1, day: 1, hour: 1 })

export default mongoose.models.BoxTTEntry ||
  mongoose.model('BoxTTEntry', schema)
