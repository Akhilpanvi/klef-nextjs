import { requireAuth } from '@/lib/auth'
import { connectDB }   from '@/lib/mongodb'
import BoxTTEntry      from '@/lib/models/BoxTTEntry'
import BoxTTSnapshot   from '@/lib/models/BoxTTSnapshot'
import formidable      from 'formidable'
import fs              from 'fs'
import * as XLSX       from 'xlsx'

export const config = { api: { bodyParser: false } }

const DAY_MAP  = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 }
const MAX_HOUR = 11

function makeSnapshotId() { return `boxtt_${Date.now()}` }

function makeLabel(filename) {
  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const base    = filename ? filename.replace(/\.[^.]+$/, '') : 'BoxTT'
  return `${base} (${dateStr} ${timeStr})`
}

function parseBoxTT(buf, snapshotId) {
  const wb   = XLSX.read(buf, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  // Normalize keys once for all rows
  const normalizeKey = k => k.toString().toLowerCase().replace(/\s+/g, '_')

  // slot map: key = `${room}|${day}|${hour}` → Set of labels
  const slotMap = new Map()

  for (const rawRow of rows) {
    const row = Object.fromEntries(
      Object.entries(rawRow).map(([k, v]) => [normalizeKey(k), v])
    )

    const rawRoom = (row['umat_classroomno'] || '').toString().trim()
    const dayRaw  = (row['umatdayid']         || '').toString().trim()
    const hourRaw = (row['umat_hourno']        || '').toString().trim()

    if (!rawRoom || !dayRaw || !hourRaw) continue

    const day  = DAY_MAP[dayRaw]
    const hour = parseInt(hourRaw, 10)

    if (!day || isNaN(hour) || hour < 1 || hour > MAX_HOUR) continue

    const baseRoom = rawRoom.replace(/[- ]?(MA|A|B|C|D)$/i, '').trim().toUpperCase()

    const course = (row['course_code'] || '').toString().trim()
    const dept   = (row['dept']        || '').toString().trim()
    const sec    = (row['main_sectionno'] || '').toString().trim()

    let label = course
    if (dept || sec) {
      const suffix = sec ? `${dept}-${sec}` : dept
      if (suffix) label += ` (${suffix})`
    }
    label = label.trim() || 'Class'

    const key = `${baseRoom}|${day}|${hour}`
    if (!slotMap.has(key)) slotMap.set(key, new Set())
    slotMap.get(key).add(label)
  }

  const docs = []
  for (const [key, labelSet] of slotMap) {
    const [room_no, dayStr, hourStr] = key.split('|')
    docs.push({
      room_no,
      dataset: snapshotId,
      day:     parseInt(dayStr, 10),
      hour:    parseInt(hourStr, 10),
      label:   [...labelSet].join(' / '),
    })
  }
  return docs
}

export default async function handler(req, res) {

  // ── GET: status ───────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const user = await requireAuth(req, res)
    if (!user) return
    await connectDB()
    const snap = await BoxTTSnapshot.findOne().lean()
    if (!snap) return res.json({ success: true, active: false })
    return res.json({
      success:         true,
      active:          true,
      label:           snap.label,
      filename:        snap.filename,
      rowCount:        snap.rowCount,
      uploadedAt:      snap.uploadedAt,
      uploadedByName:  snap.uploadedByName,
      snapshotId:      snap.snapshotId,
    })
  }

  // ── POST: upload ──────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const user = await requireAuth(req, res, 'admin')
    if (!user) return

    const form = formidable({ maxFileSize: 50 * 1024 * 1024, keepExtensions: true })
    let fields, files
    try {
      ;[fields, files] = await form.parse(req)
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Failed to parse form: ' + err.message })
    }

    const fileArr = files['boxtt']
    if (!fileArr?.length)
      return res.status(400).json({ success: false, message: 'No file provided (field name: boxtt)' })

    const file       = fileArr[0]
    const buf        = fs.readFileSync(file.filepath)
    const snapshotId = makeSnapshotId()

    let docs
    try {
      docs = parseBoxTT(buf, snapshotId)
    } catch (err) {
      return res.status(422).json({ success: false, message: 'Parse failed: ' + err.message })
    }

    if (!docs.length)
      return res.status(422).json({ success: false, message: 'No valid rows found in file' })

    await connectDB()

    const prevSnap = await BoxTTSnapshot.findOne().lean()
    if (prevSnap) {
      await BoxTTEntry.deleteMany({ dataset: prevSnap.snapshotId })
      await BoxTTSnapshot.deleteMany({})
    }

    const CHUNK = 1000
    for (let i = 0; i < docs.length; i += CHUNK) {
      await BoxTTEntry.insertMany(docs.slice(i, i + CHUNK), { ordered: false })
    }

    const label = makeLabel(file.originalFilename || file.newFilename)
    await BoxTTSnapshot.create({
      snapshotId,
      label,
      filename:       file.originalFilename || file.newFilename,
      rowCount:       docs.length,
      uploadedBy:     user._id.toString(),
      uploadedByName: user.display_name || user.username,
    })

    return res.json({ success: true, inserted: docs.length, snapshotId, label,
      message: `Box TT uploaded — ${docs.length} slot entries` })
  }

  // ── DELETE: clear ─────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const user = await requireAuth(req, res, 'admin')
    if (!user) return
    await connectDB()
    const snap = await BoxTTSnapshot.findOne().lean()
    if (!snap) return res.json({ success: true, message: 'No Box TT data to clear' })
    await BoxTTEntry.deleteMany({ dataset: snap.snapshotId })
    await BoxTTSnapshot.deleteMany({})
    return res.json({ success: true, message: 'Box TT data cleared successfully' })
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' })
}
