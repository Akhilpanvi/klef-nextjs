import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'
import TimetableSnapshot from '@/lib/models/TimetableSnapshot'
import RoomMeta from '@/lib/models/RoomMeta'
import { parseBTTBuffer, parseRoomBuffer } from '@/lib/csvParser'
import formidable from 'formidable'
import fs from 'fs'

export const config = {
  api: { bodyParser: false },
}

function makeSnapshotId(type) {
  return `${type}_${Date.now()}`
}

function makeLabel(filename, type) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:false })
  const base = filename ? filename.replace(/\.[^.]+$/, '') : type.toUpperCase()
  return `${base} (${dateStr} ${timeStr})`
}

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res, 'admin')
  if (!user) return

  const form = formidable({ maxFileSize: 100 * 1024 * 1024, keepExtensions: true })
  let fields, files
  try {
    ;[fields, files] = await form.parse(req)
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Failed to parse form: ' + err.message })
  }

  await connectDB()

  const results = {}

  // ── BTT Timetable upload (live or master) ─────────────────────────────────
  for (const key of ['timetable', 'master']) {
    const fileArr = files[key]
    if (!fileArr?.length) continue

    const file    = fileArr[0]
    const type    = key === 'master' ? 'master' : 'live'
    const buf     = fs.readFileSync(file.filepath)

    // For master: still replace (only one master needed)
    // For live: keep history — create a new snapshot
    const snapshotId = type === 'master' ? 'master' : makeSnapshotId(type)

    let docs
    try {
      docs = parseBTTBuffer(buf, snapshotId)
    } catch (err) {
      results[key] = { error: 'Parse failed: ' + err.message }
      continue
    }

    if (!docs.length) {
      results[key] = { error: 'No valid rows found in file' }
      continue
    }

    if (type === 'master') {
      // Master: replace existing
      await TimetableEntry.deleteMany({ dataset: 'master' })
    }
    // Live: don't delete old snapshots — history is preserved

    const CHUNK = 1000
    let inserted = 0
    for (let i = 0; i < docs.length; i += CHUNK) {
      await TimetableEntry.insertMany(docs.slice(i, i + CHUNK), { ordered: false })
      inserted += Math.min(CHUNK, docs.length - i)
    }

    // Deactivate previous active snapshot of same type
    await TimetableSnapshot.updateMany({ type, isActive: true }, { $set: { isActive: false } })

    // Create new snapshot record (active)
    const label = makeLabel(file.originalFilename || file.newFilename, type)
    await TimetableSnapshot.create({
      label,
      filename: file.originalFilename || file.newFilename,
      type,
      snapshotId,
      rowCount: inserted,
      isActive: true,
    })

    results[key] = { success: true, inserted, dataset: snapshotId, label }
  }

  // ── Room metadata upload ──────────────────────────────────────────────────
  const roomFileArr = files['rooms']
  if (roomFileArr?.length) {
    const buf  = fs.readFileSync(roomFileArr[0].filepath)
    const rows = parseRoomBuffer(buf)

    if (rows.length) {
      const ops = rows.map(r => ({
        updateOne: {
          filter: { room_no: r.room_no },
          update: { $set: r },
          upsert: true,
        },
      }))
      const result = await RoomMeta.bulkWrite(ops)
      results.rooms = { success: true, upserted: result.upsertedCount, modified: result.modifiedCount }
    } else {
      results.rooms = { error: 'No valid rows in room file' }
    }
  }

  if (!Object.keys(results).length)
    return res.status(400).json({ success: false, message: 'No files were provided' })

  res.json({ success: true, results })
}
