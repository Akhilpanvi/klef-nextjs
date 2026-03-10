/**
 * Run: node scripts/seed.mjs
 * Creates the admin user in MongoDB.
 * Requires MONGODB_URI in .env.local (or environment).
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

// Load .env.local manually
try {
  const env = readFileSync(resolve(__dir, '../.env.local'), 'utf-8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
} catch { /* .env.local not found, rely on process.env */ }

import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const { MONGODB_URI, ADMIN_PASSWORD = 'Klvzacse2' } = process.env
if (!MONGODB_URI) throw new Error('MONGODB_URI not set')

await mongoose.connect(MONGODB_URI)

const UserSchema = new mongoose.Schema({
  username: String, password_hash: String,
  role: { type: String, default: 'admin' },
  display_name: String, is_active: { type: Boolean, default: true },
})
const User = mongoose.models.User || mongoose.model('User', UserSchema)

const existing = await User.findOne({ username: 'admin' })
if (existing) {
  console.log('✓ Admin user already exists.')
} else {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12)
  await User.create({ username: 'admin', password_hash: hash, role: 'admin', display_name: 'Portal Admin' })
  console.log(`✓ Admin created — username: admin, password: ${ADMIN_PASSWORD}`)
  console.log('  Change this in .env.local immediately if deploying to production.')
}

await mongoose.disconnect()
console.log('Seed complete.')
