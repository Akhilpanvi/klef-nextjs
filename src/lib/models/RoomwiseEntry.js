import mongoose from 'mongoose'

/**
 * RoomwiseEntry
 * ─────────────
 * One document = one row from Roomwise-TT-xx.xx.xxxx.csv
 * Stores sparse slot data: only non-empty slots are stored.
 *
 * CSV format: Roomno, Mon1..Mon24, Tue1..Tue24, ..., Sat1..Sat24
 * day: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
 */
const schema = new mongoose.Schema(
  {
    room_no:    { type: String, required: true, trim: true, index: true },
    dataset:    { type: String, required: true, index: true }, // snapshotId e.g. 'roomwise_1234567890'
    day:        { type: Number, required: true, min: 1, max: 6, index: true }, // 1=Mon..6=Sat
    hour:       { type: Number, required: true, min: 1, max: 24, index: true },
    label:      { type: String, trim: true }, // raw cell value from CSV
  },
  { timestamps: false }
)

schema.index({ dataset: 1, day: 1, hour: 1 })
schema.index({ dataset: 1, room_no: 1 })
schema.index({ dataset: 1, day: 1, hour: 1, room_no: 1 })

export default mongoose.models.RoomwiseEntry ||
  mongoose.model('RoomwiseEntry', schema)
