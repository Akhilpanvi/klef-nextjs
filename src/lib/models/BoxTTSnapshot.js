import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  snapshotId:      { type: String, required: true, unique: true },
  label:           { type: String },
  filename:        { type: String },
  rowCount:        { type: Number, default: 0 },
  uploadedAt:      { type: Date, default: Date.now },
  uploadedBy:      { type: String },       // user._id as string
  uploadedByName:  { type: String },       // display_name or username
})

export default mongoose.models.BoxTTSnapshot ||
  mongoose.model('BoxTTSnapshot', schema)
