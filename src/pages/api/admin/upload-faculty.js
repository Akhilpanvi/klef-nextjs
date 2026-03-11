import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import User from '@/lib/models/User'
import formidable from 'formidable'
import fs from 'fs'
import bcrypt from 'bcryptjs'

export const config = {
  api: { bodyParser: false },
}

function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim())
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))

  return lines.slice(1).map(line => {
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

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const admin = await requireAuth(req, res, 'admin')
  if (!admin) return

  const form = formidable({ maxFileSize: 20 * 1024 * 1024 })
  let files
  try {
    ;[, files] = await form.parse(req)
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Failed to parse form: ' + err.message })
  }

  const fileArr = files['faculty']
  if (!fileArr?.length)
    return res.status(400).json({ success: false, message: 'No faculty CSV file provided' })

  const csvText = fs.readFileSync(fileArr[0].filepath, 'utf-8')
  const rows = parseCSV(csvText)

  await connectDB()

  let created = 0, updated = 0, skipped = 0

  for (const row of rows) {
    const eid  = (row['EID'] || '').trim()
    const name = (row['Faculty Name'] || '').trim()

    if (!eid || eid === '0' || !name || isNaN(Number(eid))) { skipped++; continue }

    const dept        = (row['Dept'] || '').trim()
    const designation = (row['Desigination'] || '').trim()
    const username    = eid.toLowerCase()

    const existing = await User.findOne({ $or: [{ username }, { eid }] })

    if (existing) {
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

  res.json({ success: true, created, updated, skipped })
}
