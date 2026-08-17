import mongoose from 'mongoose'

/**
 * ColumnMapping
 * ─────────────
 * Editable CSV header aliases for the BTT / Google-Sheet parser, so a column
 * rename in the export can be handled from the Admin page instead of a code
 * change. One document, _id 'btt'.
 *
 * `columns` is { appField: [header, …] }, newest spelling first. Any field
 * absent here falls back to the defaults in lib/csvParser.
 */
const schema = new mongoose.Schema({
  _id:       { type: String, default: 'btt' },
  columns:   { type: Map, of: [String], default: undefined },
  updatedBy: { type: String },
}, { _id: false, timestamps: true })

export default mongoose.models.ColumnMapping ||
  mongoose.model('ColumnMapping', schema)
