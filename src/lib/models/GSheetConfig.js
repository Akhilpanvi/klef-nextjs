import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  _id:           { type: String, default: 'live' },
  spreadsheetId: { type: String, default: '' },
  sheetName:     { type: String, default: 'Sheet1' },
  academicYear:  { type: String, default: '' },
  semester:      { type: String, default: '' },
  lastSyncedAt:  { type: Date },
  lastSyncRows:  { type: Number },
  lastSyncLabel: { type: String },
}, { _id: false })

export default mongoose.models.GSheetConfig ||
  mongoose.model('GSheetConfig', schema)
