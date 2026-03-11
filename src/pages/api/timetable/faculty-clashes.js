import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'
import RoomMeta from '@/lib/models/RoomMeta'
import { detectClashes } from '@/lib/clashEngine'

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  const user = await requireAuth(req, res)
  if (!user) return

  const { q } = req.query
  if (!q) return res.status(400).json({ success: false, message: 'q param required' })

  await connectDB()

  // Use master dataset if available, else live
  const masterCount = await TimetableEntry.countDocuments({ dataset: 'master' })
  const dataset = masterCount > 0 ? 'master' : 'live'

  // Get this faculty's entries
  const myEntries = await TimetableEntry.find({
    dataset,
    $or: [
      { emp_id: q.trim() },
      { faculty_name: { $regex: `^${q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
    ],
  }).lean()

  if (!myEntries.length) return res.json({ success: true, clashes: [] })

  // Collect unique (day, hour, room) and (day, hour, emp_id) combos
  const roomKeys = []
  const empId = myEntries[0].emp_id
  for (const e of myEntries) {
    if (e.room_no && e.umatdayid && e.umat_hourno)
      roomKeys.push({ dataset, umatdayid: e.umatdayid, umat_hourno: e.umat_hourno, room_no: e.room_no })
  }

  // Fetch all entries sharing the same room+day+hour slots
  let relatedEntries = []
  if (roomKeys.length) {
    relatedEntries = await TimetableEntry.find({
      dataset,
      $or: roomKeys.map(k => ({
        umatdayid: k.umatdayid,
        umat_hourno: k.umat_hourno,
        room_no: k.room_no,
      })),
    }).lean()
  }

  // Also fetch entries where same emp_id at same day+hour (double-booking)
  const slots = myEntries.map(e => ({ umatdayid: e.umatdayid, umat_hourno: e.umat_hourno }))
  const doubleEntries = empId ? await TimetableEntry.find({
    dataset, emp_id: empId,
    $or: slots.map(s => ({ umatdayid: s.umatdayid, umat_hourno: s.umat_hourno })),
  }).lean() : []

  // Union of all relevant entries
  const seen = new Set()
  const allEntries = []
  for (const e of [...relatedEntries, ...doubleEntries]) {
    const id = e._id.toString()
    if (!seen.has(id)) { seen.add(id); allEntries.push(e) }
  }

  const metas = await RoomMeta.find({}).lean()
  const metaMap = Object.fromEntries(metas.map(m => [m.room_no, m]))

  const allClashes = detectClashes(allEntries, metaMap)

  // Filter to only clashes involving this faculty
  const myName = (myEntries[0].faculty_name || '').toLowerCase()
  const clashes = allClashes.filter(c =>
    (c.faculty1 || '').toLowerCase() === myName ||
    (c.faculty2 || '').toLowerCase() === myName ||
    (empId && allEntries.some(e =>
      e.emp_id === empId &&
      e.umatdayid === c.day &&
      e.umat_hourno === c.hour
    ))
  )

  res.json({ success: true, clashes })
}
