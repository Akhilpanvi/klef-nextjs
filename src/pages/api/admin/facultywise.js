import { requireAuth }        from '@/lib/auth'
import { connectDB }          from '@/lib/mongodb'
import FacultywiseEntry       from '@/lib/models/FacultywiseEntry'
import FacultywiseFaculty     from '@/lib/models/FacultywiseFaculty'
import FacultywiseSnapshot    from '@/lib/models/FacultywiseSnapshot'
import { parseFacultywiseBuffer } from '@/lib/facultywiseParser'
import formidable from 'formidable'
import fs from 'fs'

export const config = { api: { bodyParser: false } }

const makeSnapshotId = () => `facultywise_${Date.now()}`

function makeLabel(filename) {
  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const base    = filename ? filename.replace(/\.[^.]+$/, '') : 'Facultywise-TT'
  return `${base} (${dateStr} ${timeStr})`
}

/** Remove a snapshot and everything tagged with it. */
async function clearAll() {
  const snap = await FacultywiseSnapshot.findOne().lean()
  if (!snap) return null
  await Promise.all([
    FacultywiseEntry.deleteMany({ dataset: snap.snapshotId }),
    FacultywiseFaculty.deleteMany({ dataset: snap.snapshotId }),
    FacultywiseSnapshot.deleteMany({}),
  ])
  return snap
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const user = await requireAuth(req, res)
    if (!user) return
    await connectDB()
    const snap = await FacultywiseSnapshot.findOne().lean()
    if (!snap) return res.json({ success: true, active: false })
    return res.json({
      success: true, active: true,
      label: snap.label, filename: snap.filename,
      rowCount: snap.rowCount, facultyCount: snap.facultyCount,
      uploadedAt: snap.uploadedAt, snapshotId: snap.snapshotId,
    })
  }

  if (req.method === 'POST') {
    const user = await requireAuth(req, res, 'admin')
    if (!user) return

    const form = formidable({ maxFileSize: 50 * 1024 * 1024, keepExtensions: true })
    let files
    try { ;[, files] = await form.parse(req) }
    catch (err) {
      return res.status(400).json({ success: false, message: 'Failed to parse form: ' + err.message })
    }

    const fileArr = files['facultywise']
    if (!fileArr?.length)
      return res.status(400).json({ success: false, message: 'No file provided (field name: facultywise)' })

    const file       = fileArr[0]
    const buf        = fs.readFileSync(file.filepath)
    const snapshotId = makeSnapshotId()

    let parsed
    try { parsed = parseFacultywiseBuffer(buf, snapshotId) }
    catch (err) {
      return res.status(422).json({ success: false, message: 'Parse failed: ' + err.message })
    }

    const { docs, faculty, warnings, headers, slotColumns } = parsed
    if (!faculty.length)
      return res.status(422).json({
        success: false,
        message: 'No faculty rows found in file',
        warnings, detectedColumns: headers,
      })

    await connectDB()
    await clearAll()

    const CHUNK = 1000
    let inserted = 0
    for (let i = 0; i < docs.length; i += CHUNK) {
      await FacultywiseEntry.insertMany(docs.slice(i, i + CHUNK), { ordered: false })
      inserted += Math.min(CHUNK, docs.length - i)
    }
    for (let i = 0; i < faculty.length; i += CHUNK) {
      await FacultywiseFaculty.insertMany(faculty.slice(i, i + CHUNK), { ordered: false })
    }

    const label = makeLabel(file.originalFilename || file.newFilename)
    await FacultywiseSnapshot.create({
      snapshotId, label,
      filename: file.originalFilename || file.newFilename,
      rowCount: inserted, facultyCount: faculty.length,
    })

    return res.json({
      success: true, inserted, snapshotId, label,
      facultyCount: faculty.length, slotColumns, warnings,
      detectedColumns: headers,
      message: `Faculty-wise TT uploaded — ${faculty.length} faculty, ${inserted} busy slots`,
    })
  }

  if (req.method === 'DELETE') {
    const user = await requireAuth(req, res, 'admin')
    if (!user) return
    await connectDB()
    const snap = await clearAll()
    return res.json({
      success: true,
      message: snap ? 'Faculty-wise TT data cleared' : 'No faculty-wise data to clear',
    })
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' })
}
