import mongoose from 'mongoose'

/**
 * ErpRoomData
 * ───────────
 * ERP room metadata grouped by base room name.
 * Source: ERP-ROOMDATA CSV (columns: ROOM-MA, ROOM ID, ROOM NAME, Assoc, description, block)
 * One document per base room. sections[] holds each assoc variant and its ERP ID.
 * erp_id is the primary ID (MA section if present, else first section).
 */
const schema = new mongoose.Schema(
  {
    room_no:     { type: String, required: true, unique: true, trim: true, index: true },
    erp_id:      { type: Number, default: null },
    description: { type: String, trim: true },
    block:       { type: String, trim: true },
    sections:    [{ assoc: String, erp_id: Number }],
  },
  { timestamps: true }
)

export default mongoose.models.ErpRoomData ||
  mongoose.model('ErpRoomData', schema)
