import mongoose from 'mongoose'

/**
 * FacultywiseEntry
 * One document per busy faculty slot, parsed from the Faculty-wise TT grid.
 *
 * The source is wide: uni_id / facultyname / campusshortname followed by a
 * column per day+period ("mon 1" .. "sat 11"). Each busy cell holds a block
 * like:
 *     Room No: S719B
 *     Degree: Mtech-CSE
 *     Offering Level: 2
 *     Course Code: 25IE6148
 *     Delivery Component: P
 *     Section:1
 * Free cells hold "-" and are not stored, so this collection stays sparse.
 */
const schema = new mongoose.Schema({
  dataset:      { type: String, required: true, index: true },
  uni_id:       { type: String, required: true, trim: true, index: true },
  faculty_name: { type: String, trim: true },
  campus:       { type: String, trim: true },

  day:  { type: Number, required: true, min: 1, max: 7 },
  hour: { type: Number, required: true, min: 1, max: 24 },

  room_no:        { type: String, trim: true },
  degree:         { type: String, trim: true },
  offering_level: { type: String, trim: true },
  course_code:    { type: String, trim: true },
  component:      { type: String, trim: true },
  section:        { type: String, trim: true },
  raw:            { type: String },
})

// Free-faculty and free-room lookups for a slot
schema.index({ dataset: 1, day: 1, hour: 1 })
schema.index({ dataset: 1, room_no: 1, day: 1, hour: 1 })
schema.index({ dataset: 1, uni_id: 1, day: 1, hour: 1 })

export default mongoose.models.FacultywiseEntry ||
  mongoose.model('FacultywiseEntry', schema)
