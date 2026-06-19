import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import User from '@/lib/models/User'
import formidable from 'formidable'
import fs from 'fs'
import bcrypt from 'bcryptjs'

export const config = {
  api: { bodyParser: false },
}

const SAMPLE_CSV = `Emp No,Faculty Name,Designation,Contact Number,Email ID,Cohort,Cohort Name,Designation Load,Permissible Load,Assigned responsibility,DPET
9122,DR. V S V PRABHAKAR,Professor &HoD,7730007703,prabhakarvsv@kluniversity.in,E02,Cohort E02 : Artificial Intelligence (AI),8,8,HOD,AIDS
6230,DR. V RAMA KRISHNA SARMA,Associate Professor-Alternate HoD,9398750319,sharmavsv@kluniversity.in,E11,Cohort E11-Data Science & Big Data Analytics (DSBD),12,12,Alt. HOD,AIDS
3680,DR. I SATISH BABU,Associate Professor-Dy HoD,9985781568,jampanisatishbabu@kluniversity.in,E09,Cohort E09 : Cyber Security & Blockchain Technology (CSBT),14,14,Dy. HOD,AIDS
`

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

function num(val) {
  const n = Number(val)
  return (!val || val === '0' || isNaN(n)) ? undefined : n
}
function str(val) { return val || undefined }

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="KLEF-FD-sample.csv"')
    return res.send(SAMPLE_CSV)
  }

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

  // Parse all valid rows first
  const valid = []
  let skipped = 0
  for (const row of rows) {
    // Support both old format (EID) and new format (Emp No)
    const eid  = (row['Emp No'] || row['EID'] || '').trim()
    const name = (row['Faculty Name'] || '').trim()
    if (!eid || eid === '0' || !name || isNaN(Number(eid))) { skipped++; continue }
    const cohortRaw = str(row['Cohort'])
    valid.push({
      eid,
      username:                  eid.toLowerCase(),
      display_name:              name,
      dept:                      str(row['DPET'] || row['Dept']),
      designation:               str(row['Designation'] || row['Desigination']),
      phone:                     str(row['Contact Number']),
      email:                     str(row['Email ID']),
      cohort:                    cohortRaw === '0' ? undefined : cohortRaw,
      cohort_name:               str(row['Cohort Name']),
      designation_category:      str(row['Category (R/Ac/Ad)']),
      assigned_responsibility:   str(row['Assigned responsibility']),
      load_as_per_designation:   num(row['Designation Load'] || row['Load As Per Desigination']),
      pl:                        num(row['Permissible Load'] || row['PL']),
    })
  }

  // Batch-fetch all existing users by eid in one query
  const allEids = valid.map(r => r.eid)
  const existing = await User.find({ eid: { $in: allEids } }).lean()
  const existingMap = {}
  existing.forEach(u => { existingMap[u.eid] = u })

  const toCreate = []
  const updateOps = []

  for (const r of valid) {
    if (existingMap[r.eid]) {
      updateOps.push({
        updateOne: {
          filter: { eid: r.eid },
          update: { $set: {
            display_name:              r.display_name,
            ...(r.dept         && { dept: r.dept }),
            ...(r.designation  && { designation: r.designation }),
            ...(r.phone        && { phone: r.phone }),
            ...(r.email        && { email: r.email }),
            ...(r.cohort !== undefined && { cohort: r.cohort }),
            ...(r.cohort_name  && { cohort_name: r.cohort_name }),
            designation_category:      r.designation_category,
            assigned_responsibility:   r.assigned_responsibility,
            load_as_per_designation:   r.load_as_per_designation,
            pl:                        r.pl,
          }},
        },
      })
    } else {
      toCreate.push(r)
    }
  }

  // Hash new passwords with cost 8 (temporary passwords — mustChangePassword=true)
  const newDocs = await Promise.all(toCreate.map(async r => ({
    username:                  r.username,
    password_hash:             await bcrypt.hash(r.eid, 8),
    role:                      'faculty',
    display_name:              r.display_name,
    eid:                       r.eid,
    dept:                      r.dept,
    designation:               r.designation,
    phone:                     r.phone,
    email:                     r.email,
    cohort:                    r.cohort,
    cohort_name:               r.cohort_name,
    designation_category:      r.designation_category,
    assigned_responsibility:   r.assigned_responsibility,
    load_as_per_designation:   r.load_as_per_designation,
    pl:                        r.pl,
    mustChangePassword:        true,
    is_active:                 true,
  })))

  const [bulkRes] = await Promise.all([
    updateOps.length ? User.bulkWrite(updateOps, { ordered: false }) : Promise.resolve(null),
    newDocs.length   ? User.insertMany(newDocs, { ordered: false })  : Promise.resolve(null),
  ])

  const updated = bulkRes?.modifiedCount ?? 0
  const created = newDocs.length

  res.json({ success: true, created, updated, skipped })
}
