import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'
import RoomMeta from '@/lib/models/RoomMeta'
import { detectClashes } from '@/lib/clashEngine'
import { getActiveDataset } from '@/lib/activeDataset'

const MAX_HOUR = 11

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  const user = await requireAuth(req, res)
  if (!user) return

  const { q, snap } = req.query
  if (!q) return res.status(400).json({ success: false, message: 'q param required' })

  await connectDB()
  const dataset = snap || await getActiveDataset('live')

  const myEntries = await TimetableEntry.find({
    dataset,
    umat_hourno: { $lte: MAX_HOUR },
    $or: [
      { emp_id: q.trim() },
      { faculty_name: { $regex: `^${q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
    ],
  }).lean()

  if (!myEntries.length) return res.json({ success: true, clashes: [] })

  const empId = myEntries[0].emp_id
  const roomKeys = []
  for (const e of myEntries) {
    if (e.room_no && e.umatdayid && e.umat_hourno)
      roomKeys.push({ umatdayid: e.umatdayid, umat_hourno: e.umat_hourno, room_no: e.room_no })
  }

  let relatedEntries = []
  if (roomKeys.length) {
    relatedEntries = await TimetableEntry.find({
      dataset,
      umat_hourno: { $lte: MAX_HOUR },
      $or: roomKeys.map(k => ({ umatdayid: k.umatdayid, umat_hourno: k.umat_hourno, room_no: k.room_no })),
    }).lean()
  }

  const slots = myEntries.map(e => ({ umatdayid: e.umatdayid, umat_hourno: e.umat_hourno }))
  const doubleEntries = empId ? await TimetableEntry.find({
    dataset, emp_id: empId, umat_hourno: { $lte: MAX_HOUR },
    $or: slots.map(s => ({ umatdayid: s.umatdayid, umat_hourno: s.umat_hourno })),
  }).lean() : []

  const seen = new Set()
  const allEntries = []
  for (const e of [...relatedEntries, ...doubleEntries]) {
    const id = e._id.toString()
    if (!seen.has(id)) { seen.add(id); allEntries.push(e) }
  }

  const metas = await RoomMeta.find({}).lean()
  const metaMap = Object.fromEntries(metas.map(m => [m.room_no, m]))

  const allClashes = detectClashes(allEntries, metaMap)

  const myName = (myEntries[0].faculty_name || '').toLowerCase()
  const clashes = allClashes.filter(c =>
    (c.faculty1 || '').toLowerCase() === myName ||
    (c.faculty2 || '').toLowerCase() === myName ||
    (empId && allEntries.some(e =>
      e.emp_id === empId && e.umatdayid === c.day && e.umat_hourno === c.hour
    ))
  )

  res.json({ success: true, clashes })
}
