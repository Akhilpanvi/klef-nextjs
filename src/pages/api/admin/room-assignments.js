import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import RoomAssignment from '@/lib/models/RoomAssignment'
import RoomAssignmentSnapshot from '@/lib/models/RoomAssignmentSnapshot'
import { parseRoomAssignmentBuffer } from '@/lib/roomAssignmentParser'
import formidable from 'formidable'
import fs from 'fs'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!await requireAuth(req, res)) return
    await connectDB()
    const snapshot = await RoomAssignmentSnapshot.findOne({ key: 'active' }).lean()
    return res.json({ success: true, active: Boolean(snapshot),
      ...(snapshot ? { filename: snapshot.filename, matchedCount: snapshot.matchedCount,
        missingCount: snapshot.missingRooms.length, unmatchedCount: snapshot.unmatchedRooms.length,
        uploadedAt: snapshot.uploadedAt } : {}) })
  }

  if (req.method === 'POST') {
    if (!await requireAuth(req, res, 'admin')) return
    const form = formidable({ maxFileSize: 20 * 1024 * 1024, keepExtensions: true })
    let files
    try { ;[, files] = await form.parse(req) }
    catch (error) { return res.status(400).json({ success: false, message: `Unable to read upload: ${error.message}` }) }
    const file = (files.assignment || files.file || [])[0]
    if (!file) return res.status(400).json({ success: false, message: 'Select a CSV or XLSX file' })

    let parsed
    try { parsed = parseRoomAssignmentBuffer(fs.readFileSync(file.filepath)) }
    catch (error) { return res.status(422).json({ success: false, message: error.message }) }

    await connectDB()
    const dataset = `room_assignments_${Date.now()}`
    await RoomAssignment.insertMany(parsed.docs.map(doc => ({ ...doc, dataset })), { ordered: true })
    try {
      await RoomAssignmentSnapshot.findOneAndUpdate({ key: 'active' }, {
        key: 'active', dataset, filename: file.originalFilename || file.newFilename,
        matchedCount: parsed.docs.length, missingRooms: parsed.missingRooms,
        unmatchedRooms: parsed.unmatchedRooms, uploadedAt: new Date(),
      }, { upsert: true, new: true })
    } catch (error) {
      await RoomAssignment.deleteMany({ dataset })
      throw error
    }
    await RoomAssignment.deleteMany({ dataset: { $ne: dataset } })
    return res.json({ success: true, inserted: parsed.docs.length,
      missingCount: parsed.missingRooms.length, unmatchedCount: parsed.unmatchedRooms.length,
      missingRooms: parsed.missingRooms, unmatchedRooms: parsed.unmatchedRooms })
  }

  if (req.method === 'DELETE') {
    if (!await requireAuth(req, res, 'admin')) return
    await connectDB()
    await RoomAssignmentSnapshot.deleteMany({})
    await RoomAssignment.deleteMany({})
    return res.json({ success: true, message: 'Uploaded assignments cleared; bundled assignments are active' })
  }
  return res.status(405).json({ success: false, message: 'Method not allowed' })
}
