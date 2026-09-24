import { approvedRooms, approvedRoomKey } from '@/lib/approvedRooms'
import { requireAuth } from '@/lib/auth'
import { connectDB }   from '@/lib/mongodb'
import RoomMeta        from '@/lib/models/RoomMeta'
import ErpRoomData     from '@/lib/models/ErpRoomData'

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  await connectDB()

  const [metaRooms, erpRooms] = await Promise.all([
    RoomMeta.find({}, 'room_no').lean(),
    ErpRoomData.find({}, 'room_no erp_id sections').lean(),
  ])

  const map = new Map(approvedRooms.map(r => [r.room_no, { room: r.room_no, erp_id: null, erp_ids: [] }]))

  for (const r of metaRooms) {
    r.room_no = approvedRoomKey(r.room_no)
    if (!r.room_no) continue
    map.set(r.room_no, { room: r.room_no, erp_id: null, erp_ids: [] })
  }

  for (const r of erpRooms) {
    r.room_no = approvedRoomKey(r.room_no)
    if (!r.room_no) continue
    const entry = map.get(r.room_no) || { room: r.room_no, erp_id: null, erp_ids: [] }
    entry.erp_id  = r.erp_id ?? null
    entry.erp_ids = (r.sections || []).map(s => s.erp_id).filter(Boolean)
    map.set(r.room_no, entry)
  }

  const rooms = [...map.values()].sort((a, b) =>
    a.room.localeCompare(b.room, undefined, { numeric: true })
  )

  res.json({ success: true, rooms })
}
