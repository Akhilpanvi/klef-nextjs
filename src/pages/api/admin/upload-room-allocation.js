import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import RoomAllocation from '@/lib/models/RoomAllocation'
import formidable from 'formidable'
import fs from 'fs'
import Papa from 'papaparse'

export const config = { api: { bodyParser: false } }

// Sample CSV headers for reference download
export const SAMPLE_HEADERS = 'SL NO,BLOCK,FLOOR,ROOM NO,ROOM CAPACITY,MON,TUE,WED,THU,FRI,SAT,TYPE,COE/MHS'
export const SAMPLE_ROW     = '1,C,0,C007,72,I PBL,I PBL,I PBL,I PBL,I PBL,I PBL,CR,'

function parseCapacity(raw) {
  if (!raw) return null
  const n = parseInt(String(raw).replace(/[^0-9]/g, ''))
  return isNaN(n) ? null : n
}

export default async function handler(req, res) {
  // GET — return sample CSV for download reference
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="room-allocation-sample.csv"')
    return res.send(`${SAMPLE_HEADERS}\n${SAMPLE_ROW}\n2,C,0,C008,84,I PBL,I PBL,I PBL,I PBL,I PBL,I PBL,CR,\n3,FED,1,F103,84,I ENGG,I ENGG,I ENGG,I ENGG,I ENGG,I ENGG,CR,\n`)
  }

  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res, 'admin')
  if (!user) return

  const form = formidable({ maxFileSize: 20 * 1024 * 1024 })
  let fields, files
  try { [fields, files] = await form.parse(req) }
  catch (e) { return res.status(400).json({ success: false, message: 'Form parse error: ' + e.message }) }

  const fileArr = files['file'] || files['rooms'] || Object.values(files)[0]
  if (!fileArr?.length) return res.status(400).json({ success: false, message: 'No file provided' })

  const buf  = fs.readFileSync(fileArr[0].filepath)
  const text = buf.toString('utf-8').replace(/^﻿/, '')

  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() })

  const rows = data.filter(r => r['ROOM NO'] && r['ROOM NO'].trim())
  if (!rows.length) return res.status(400).json({ success: false, message: 'No valid room rows found. Check that "ROOM NO" column exists.' })

  await connectDB()

  // Replace all existing room allocation data
  await RoomAllocation.deleteMany({})

  const docs = rows.map((r, i) => ({
    slNo:     parseInt(r['SL NO']) || (i + 1),
    block:    (r['BLOCK'] || '').trim(),
    floor:    parseInt(r['FLOOR']) ?? 0,
    roomNo:   r['ROOM NO'].trim(),
    capacity: parseCapacity(r['ROOM CAPACITY'] || r['ROOMCAPACITY']),
    mon:      (r['MON'] || '').trim() || null,
    tue:      (r['TUE'] || '').trim() || null,
    wed:      (r['WED'] || '').trim() || null,
    thu:      (r['THU'] || '').trim() || null,
    fri:      (r['FRI'] || '').trim() || null,
    sat:      (r['SAT'] || '').trim() || null,
    type:     (r['TYPE'] || '').trim() || null,
    coeMhs:   (r['COE/MHS'] || '').trim() || null,
    status:   'free',
    notes:    '',
  }))

  await RoomAllocation.insertMany(docs, { ordered: false })
  return res.json({ success: true, inserted: docs.length })
}
