import { requireAuth }    from '@/lib/auth'
import { connectDB }      from '@/lib/mongodb'
import RoomwiseEntry      from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot   from '@/lib/models/RoomwiseSnapshot'
import { parseRoomwiseBuffer } from '@/lib/roomwiseParser'
import { makeSnapshotId, replaceRoomwiseSnapshot } from '@/lib/roomwiseStore'
import formidable from 'formidable'
import fs from 'fs'

export const config = {
  api: { bodyParser: false },
}

export default async function handler(req, res) {

  // ── GET: return current roomwise snapshot status ──────────────────────────
  if (req.method === 'GET') {
    const user = await requireAuth(req, res)
    if (!user) return
    await connectDB()
    const snap = await RoomwiseSnapshot.findOne().lean()
    if (!snap) return res.json({ success: true, active: false })
    return res.json({
      success:    true,
      active:     true,
      label:      snap.label,
      filename:   snap.filename,
      rowCount:   snap.rowCount,
      uploadedAt: snap.uploadedAt,
      snapshotId: snap.snapshotId,
    })
  }

  // ── POST: upload new Roomwise-TT CSV ──────────────────────────────────────
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

    const fileArr = files['roomwise']
    if (!fileArr?.length)
      return res.status(400).json({ success: false, message: 'No file provided (field name: roomwise)' })

    const file       = fileArr[0]
    const buf        = fs.readFileSync(file.filepath)
    const snapshotId = makeSnapshotId()

    let docs
    try {
      docs = parseRoomwiseBuffer(buf, snapshotId)
    } catch (err) {
      return res.status(422).json({ success: false, message: 'Parse failed: ' + err.message })
    }

    if (!docs.length)
      return res.status(422).json({ success: false, message: 'No valid rows found in file' })

    await connectDB()

    const { inserted, label } = await replaceRoomwiseSnapshot({
      docs, snapshotId, filename: file.originalFilename || file.newFilename,
    })

    return res.json({ success: true, inserted, snapshotId, label,
      message: `Roomwise TT uploaded — ${inserted} slot entries` })
  }

  // ── DELETE: clear roomwise data ───────────────────────────────────────────
  if (req.method === 'DELETE') {
    const user = await requireAuth(req, res, 'admin')
    if (!user) return

    await connectDB()
    const snap = await RoomwiseSnapshot.findOne().lean()
    if (!snap) return res.json({ success: true, message: 'No roomwise data to clear' })

    await RoomwiseEntry.deleteMany({ dataset: snap.snapshotId })
    await RoomwiseSnapshot.deleteMany({})

    return res.json({ success: true, message: 'Roomwise TT data cleared successfully' })
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' })
}
