import mongoose from 'mongoose'

/**
 * ErpLoginSession
 * ───────────────
 * Holds the ERP cookie jar + CSRF token between showing the captcha and
 * submitting the login (serverless functions keep nothing in memory).
 * One per admin; MongoDB drops it after 10 minutes. Never holds a password.
 */
const schema = new mongoose.Schema({
  userId:    { type: String, required: true, unique: true },
  jar:       { type: Object, default: {} },
  csrf:      { type: String },
  createdAt: { type: Date, default: Date.now, expires: 600 },
})

export default mongoose.models.ErpLoginSession ||
  mongoose.model('ErpLoginSession', schema)
