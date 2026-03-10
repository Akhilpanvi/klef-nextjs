import mongoose from 'mongoose'

/**
 * RoomMeta
 * ────────
 * Static reference data from KLEF-ERP-RD.csv.
 * Columns: SLNO, Room No, BLOCK, CR/LAB, TOTAL, ALLOTED TO, DEPT ALLOTED TO
 */
const schema = new mongoose.Schema(
  {
    room_no:       { type: String, required: true, unique: true, trim: true, index: true },
    block:         { type: String, trim: true, index: true },   // C, E, F, R, S, SK...
    room_type:     { type: String, trim: true },                // CR, LAB, HLAB, SPORTS...
    capacity:      { type: Number, default: null },             // TOTAL
    alloted_to:    { type: String, trim: true },                // COE, COR, CRT, FED...
    dept_alloted:  { type: String, trim: true },                // R24-CSE-1, etc.
    slno:          { type: Number },
  },
  { timestamps: true }
)

export default mongoose.models.RoomMeta ||
  mongoose.model('RoomMeta', schema)
