import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const schema = new mongoose.Schema(
  {
    username:           { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash:      { type: String, required: true },
    role:               { type: String, enum: ['viewer', 'admin', 'faculty'], default: 'viewer' },
    display_name:       { type: String, trim: true },
    last_login:         { type: Date, default: null },
    is_active:          { type: Boolean, default: true },
    // Faculty-specific
    eid:                { type: String, trim: true, sparse: true, index: true },
    dept:               { type: String, trim: true },
    designation:        { type: String, trim: true },
    mustChangePassword: { type: Boolean, default: false },
    // Granular permissions granted to faculty by admin
    permissions:        { type: [String], default: [] },
    // Faculty profile fields (set by admin / FD upload)
    phone:                    { type: String, trim: true },  // Contact Number
    email:                    { type: String, trim: true },  // Email ID
    cohort:                   { type: String, trim: true },  // e.g. E02, E11
    cohort_name:              { type: String, trim: true },  // e.g. Cohort E02 : AI
    designation_category:     { type: String, trim: true },  // R / Ac / Ad
    assigned_responsibility:  { type: String, trim: true },  // e.g. HOD, Dy.HOD
    load_as_per_designation:  { type: Number },              // Designation Load
    pl:                       { type: Number },              // Permissible Load
  },
  { timestamps: true }
)

schema.pre('save', async function (next) {
  if (!this.isModified('password_hash')) return next()
  this.password_hash = await bcrypt.hash(this.password_hash, 12)
  next()
})

schema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password_hash)
}

schema.methods.toJSON = function () {
  const o = this.toObject()
  delete o.password_hash
  return o
}

export default mongoose.models.User ||
  mongoose.model('User', schema)
