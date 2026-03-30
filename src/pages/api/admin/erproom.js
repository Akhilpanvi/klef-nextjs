import { requireAuth }       from '@/lib/auth'
import { connectDB }         from '@/lib/mongodb'
import ErpRoomData           from '@/lib/models/ErpRoomData'
import { parseErpRoomBuffer } from '@/lib/erpRoomParser'
import formidable from 'formidable'
import fs from 'fs'

export const config = {
  api: { bodyParser: false },
}

export default async function handler(req, res) {

  // ── GET: current ERP room data status ────────────────────────────────────
  if (req.method === 'GET') {
    const user = await requireAuth(req, res)
    if (!user) return
    await connectDB()
    const count = await ErpRoomData.countDocuments()
    return res.json({ success: true, active: count > 0, roomCount: count })
  }

  // ── POST: upload ERP-ROOMDATA CSV ─────────────────────────────────────────
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

    const fileArr = files['erproom']
    if (!fileArr?.length)
      return res.status(400).json({ success: false, message: 'No file provided (field name: erproom)' })

    const file = fileArr[0]
    const buf  = fs.readFileSync(file.filepath)

    let docs
    try {
      docs = parseErpRoomBuffer(buf)
    } catch (err) {
      return res.status(422).json({ success: false, message: 'Parse failed: ' + err.message })
    }

    if (!docs.length)
      return res.status(422).json({ success: false, message: 'No valid rows found in file' })

    await connectDB()

    // Replace all existing ERP room data
    await ErpRoomData.deleteMany({})
    const CHUNK = 500
    let inserted = 0
    for (let i = 0; i < docs.length; i += CHUNK) {
      await ErpRoomData.insertMany(docs.slice(i, i + CHUNK), { ordered: false })
      inserted += Math.min(CHUNK, docs.length - i)
    }

    return res.json({ success: true, inserted, message: `ERP Room Data uploaded — ${inserted} rooms` })
  }

  // ── DELETE: clear ERP room data ───────────────────────────────────────────
  if (req.method === 'DELETE') {
    const user = await requireAuth(req, res, 'admin')
    if (!user) return
    await connectDB()
    await ErpRoomData.deleteMany({})
    return res.json({ success: true, message: 'ERP Room Data cleared' })
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' })
}
