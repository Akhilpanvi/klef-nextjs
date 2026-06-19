import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  slNo:      { type: Number },
  block:     { type: String, index: true },
  floor:     { type: Number, index: true },
  roomNo:    { type: String, required: true, index: true },
  capacity:  { type: Number },
  mon:       { type: String },
  tue:       { type: String },
  wed:       { type: String },
  thu:       { type: String },
  fri:       { type: String },
  sat:       { type: String },
  type:      { type: String, index: true },   // CR, LAB, HLAB, STUDIO, SPORTS, Activity
  coeMhs:    { type: String, index: true },   // COE / MHS / blank
  status:    { type: String, enum: ['free', 'completed'], default: 'free', index: true },
  notes:     { type: String, default: '' },
}, { timestamps: true })

schema.index({ block: 1, floor: 1 })

export default mongoose.models.RoomAllocation ||
  mongoose.model('RoomAllocation', schema)
