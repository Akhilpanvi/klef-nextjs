import { requireAuth }   from '@/lib/auth'
import { connectDB }     from '@/lib/mongodb'
import RoomwiseEntry     from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot  from '@/lib/models/RoomwiseSnapshot'
import RoomMeta          from '@/lib/models/RoomMeta'
import ErpRoomData       from '@/lib/models/ErpRoomData'

function baseKey(roomNo) { return roomNo.split('-')[0].trim().toUpperCase() }

const DAY_KEYS   = ['Mon','Tue','Wed','Thu','Fri','Sat']
const MAX_PERIOD = 11
const TOTAL_SLOTS = 6 * MAX_PERIOD // 66

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const { room } = req.query
  if (!room) return res.status(400).json({ success: false, message: 'room required' })

  await connectDB()

  const snap = await RoomwiseSnapshot.findOne().lean()
  if (!snap) return res.status(404).json({ success: false, message: 'No roomwise data uploaded' })

  const dataset  = snap.snapshotId
  const roomName = room.trim().toUpperCase()

  const allSections = await RoomwiseEntry.distinct('room_no', { dataset })
  const sections = allSections.filter(s => baseKey(s) === roomName)
  if (!sections.length)
    return res.status(404).json({ success: false, message: `Room ${roomName} not found` })

  // Only periods 1-11
  const entries = await RoomwiseEntry.find(
    { dataset, room_no: { $in: sections }, hour: { $lte: MAX_PERIOD } },
    'day hour'
  ).lean()

  const dayCounts = { Mon:0, Tue:0, Wed:0, Thu:0, Fri:0, Sat:0 }
  const hourBusy  = {}
  for (const e of entries) {
    const dk = DAY_KEYS[e.day - 1]
    if (dk) dayCounts[dk]++
    if (!hourBusy[e.hour]) hourBusy[e.hour] = new Set()
    hourBusy[e.hour].add(e.day)
  }

  const hourStats = {}
  for (let h = 1; h <= MAX_PERIOD; h++) {
    const count = (hourBusy[h] || new Set()).size
    hourStats[h] = { count, pct: Math.round((count / 6) * 100) }
  }

  const totalBusy = Object.values(dayCounts).reduce((a,b) => a+b, 0)
  const weeklyPct = Math.round((totalBusy / TOTAL_SLOTS) * 100)

  const meta   = await RoomMeta.findOne({ room_no: roomName }).lean()
  const erpDoc = await ErpRoomData.findOne({ room_no: roomName }, 'erp_id').lean()

  res.json({
    success: true,
    room:       roomName,
    erp_id:     erpDoc?.erp_id ?? null,
    capacity:   meta?.capacity || null,
    weeklyPct,
    totalBusy,
    totalSlots: TOTAL_SLOTS,
    dayCounts,
    hourStats,
  })
}
