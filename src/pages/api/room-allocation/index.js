import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import RoomAllocation from '@/lib/models/RoomAllocation'
import RoomMeta from '@/lib/models/RoomMeta'

export default async function handler(req, res) {
  const user = await requireAuth(req, res)
  if (!user) return
  await connectDB()

  // GET — list rooms with optional filters
  if (req.method === 'GET') {
    const { block, floor, type, coeMhs, status, q } = req.query
    const filter = {}
    if (block)  filter.block  = block
    if (floor !== undefined && floor !== '') filter.floor = Number(floor)
    if (type)   filter.type   = type
    if (coeMhs) filter.coeMhs = coeMhs
    if (status) filter.status = status
    if (q) {
      const re = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [
        { roomNo: re },
        { mon: re }, { tue: re }, { wed: re },
        { thu: re }, { fri: re }, { sat: re },
        { notes: re },
      ]
    }
    const rooms = await RoomAllocation.find(filter).sort({ block: 1, floor: 1, slNo: 1 }).lean()

    // Enrich capacity from RoomMeta (KLEF-ERP-RD data)
    const roomNos = rooms.map(r => r.roomNo)
    const metas = await RoomMeta.find({ room_no: { $in: roomNos } }, { room_no: 1, capacity: 1 }).lean()
    const metaMap = {}
    metas.forEach(m => { metaMap[m.room_no] = m.capacity })
    const enriched = rooms.map(r => ({
      ...r,
      capacity: metaMap[r.roomNo] ?? r.capacity,
    }))

    // Distinct filter options for dropdowns
    const [blocks, types, wings] = await Promise.all([
      RoomAllocation.distinct('block'),
      RoomAllocation.distinct('type'),
      RoomAllocation.distinct('coeMhs'),
    ])

    return res.json({ success: true, rooms: enriched, blocks: blocks.sort(), types: types.sort(), wings: wings.sort() })
  }

  // PATCH — toggle status or update notes/fields for a single room
  if (req.method === 'PATCH') {
    if (user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Admin only' })

    const { id, status, notes, capacity, mon, tue, wed, thu, fri, sat, type } = req.body || {}
    if (!id) return res.status(400).json({ success: false, message: 'id required' })

    const update = {}
    if (status !== undefined)   update.status   = status
    if (notes  !== undefined)   update.notes    = notes
    if (capacity !== undefined) update.capacity = capacity
    if (mon  !== undefined) update.mon  = mon
    if (tue  !== undefined) update.tue  = tue
    if (wed  !== undefined) update.wed  = wed
    if (thu  !== undefined) update.thu  = thu
    if (fri  !== undefined) update.fri  = fri
    if (sat  !== undefined) update.sat  = sat
    if (type !== undefined) update.type = type

    const room = await RoomAllocation.findByIdAndUpdate(id, { $set: update }, { new: true }).lean()
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' })
    return res.json({ success: true, room })
  }

  res.status(405).json({ success: false, message: 'Method not allowed' })
}
