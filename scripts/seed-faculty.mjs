/**
 * seed-faculty.mjs
 * ─────────────────
 * Reads KLEF-FD.csv and seeds faculty users into MongoDB.
 *
 * Run: NODE_OPTIONS=--tls-min-v1.2 node scripts/seed-faculty.mjs [path/to/KLEF-FD.csv]
 *
 * Each faculty gets:
 *   username        = eid (lowercase string)
 *   password        = eid (must change on first login)
 *   role            = 'faculty'
 *   mustChangePassword = true
 *
 * Safe to re-run — skips existing users, updates name/dept/designation only.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

// Load .env.local
try {
  const env = readFileSync(resolve(__dir, '../.env.local'), 'utf-8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
} catch { /* no .env.local */ }

import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const { MONGODB_URI } = process.env
if (!MONGODB_URI) throw new Error('MONGODB_URI not set')

const csvPath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(__dir, '../KLEF-FD.csv')

console.log(`Reading CSV from: ${csvPath}`)

const csvText = readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '') // strip BOM

// Parse CSV
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))

  return lines.slice(1).map(line => {
    // Handle quoted fields with commas inside
    const fields = []
    let cur = '', inQuote = false
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { fields.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    fields.push(cur.trim())

    const obj = {}
    headers.forEach((h, i) => { obj[h] = (fields[i] || '').replace(/^"|"$/g, '').trim() })
    return obj
  })
}

const rows = parseCSV(csvText)

// Connect
await mongoose.connect(MONGODB_URI)
console.log('Connected to MongoDB')

const UserSchema = new mongoose.Schema({
  username:           String,
  password_hash:      String,
  role:               { type: String, default: 'faculty' },
  display_name:       String,
  eid:                String,
  dept:               String,
  designation:        String,
  mustChangePassword: { type: Boolean, default: true },
  is_active:          { type: Boolean, default: true },
  last_login:         Date,
}, { timestamps: true })

const User = mongoose.models.User || mongoose.model('User', UserSchema)

let created = 0, skipped = 0, updated = 0

for (const row of rows) {
  const eid = (row['EID'] || '').trim()
  const name = (row['Faculty Name'] || '').trim()

  // Skip rows without valid EID or name
  if (!eid || eid === '0' || !name) { skipped++; continue }
  if (isNaN(Number(eid))) { skipped++; continue }

  const dept        = (row['Dept'] || '').trim()
  const designation = (row['Desigination'] || '').trim()
  const username    = eid.toLowerCase()

  const existing = await User.findOne({ $or: [{ username }, { eid }] })

  if (existing) {
    // Update name/dept/designation but don't touch password
    existing.display_name = name
    existing.dept         = dept || existing.dept
    existing.designation  = designation || existing.designation
    existing.eid          = eid
    await existing.save()
    updated++
  } else {
    const password_hash = await bcrypt.hash(eid, 12)
    await User.create({
      username,
      password_hash,
      role:               'faculty',
      display_name:       name,
      eid,
      dept,
      designation,
      mustChangePassword: true,
      is_active:          true,
    })
    created++
  }
}

console.log(`\n✅ Done!`)
console.log(`   Created : ${created} faculty accounts`)
console.log(`   Updated : ${updated} existing accounts`)
console.log(`   Skipped : ${skipped} rows (no EID/name)`)
console.log(`\n   Initial password for each faculty = their EID`)
console.log(`   Faculty will be forced to change password on first login.\n`)

await mongoose.disconnect()
