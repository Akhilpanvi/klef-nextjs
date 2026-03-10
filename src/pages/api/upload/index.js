import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'
import RoomMeta from '@/lib/models/RoomMeta'
import { parseBTTBuffer, parseRoomBuffer } from '@/lib/csvParser'
import formidable from 'formidable'
import fs from 'fs'

export const config = {
  api: { bodyParser: false },
}

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res, 'admin')
  if (!user) return

  // Parse multipart form
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
    const dataset = key === 'master' ? 'master' : 'live'
    const buf     = fs.readFileSync(file.filepath)

    let docs
    try {
      docs = parseBTTBuffer(buf, dataset)
    } catch (err) {
      results[key] = { error: 'Parse failed: ' + err.message }
      continue
    }

    if (!docs.length) {
      results[key] = { error: 'No valid rows found in file' }
      continue
    }

    // Clear existing dataset, then bulk insert in chunks
    await TimetableEntry.deleteMany({ dataset })
    const CHUNK = 1000
    let inserted = 0
    for (let i = 0; i < docs.length; i += CHUNK) {
      await TimetableEntry.insertMany(docs.slice(i, i + CHUNK), { ordered: false })
      inserted += Math.min(CHUNK, docs.length - i)
    }

    results[key] = { success: true, inserted, dataset }
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
      results.rooms = {
        success: true,
        upserted: result.upsertedCount,
        modified: result.modifiedCount,
      }
    } else {
      results.rooms = { error: 'No valid rows in room file' }
    }
  }

  if (!Object.keys(results).length)
    return res.status(400).json({ success: false, message: 'No files were provided' })

  res.json({ success: true, results })
}
