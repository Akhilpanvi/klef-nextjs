import mongoose from 'mongoose'

/**
 * FacultywiseFaculty
 * The roster from a Faculty-wise TT upload: one document per faculty row,
 * including staff with no classes at all.
 *
 * Kept separate from the sparse slot entries because "who is free" needs the
 * full roster - a faculty member with an empty week has no entries to count.
 */
const schema = new mongoose.Schema({
  dataset:      { type: String, required: true, index: true },
  uni_id:       { type: String, required: true, trim: true },
  faculty_name: { type: String, trim: true },
  campus:       { type: String, trim: true },
  slotCount:    { type: Number, default: 0 },
})

schema.index({ dataset: 1, uni_id: 1 }, { unique: true })
schema.index({ dataset: 1, faculty_name: 1 })

export default mongoose.models.FacultywiseFaculty ||
  mongoose.model('FacultywiseFaculty', schema)
