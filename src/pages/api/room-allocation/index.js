import { approvedRoom, isApprovedRoom } from '@/lib/approvedRooms'
import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import RoomAllocation from '@/lib/models/RoomAllocation'

export default async function handler(req, res) {
  const user = await requireAuth(req, res)
  if (!user) return
  await connectDB()

  // GET — list rooms with optional filters
  if (req.method === 'GET') {
    const { block, floor, type, coeMhs, status, q, day } = req.query
    const filter = {}
    if (floor !== undefined && floor !== '') filter.floor = Number(floor)
    if (coeMhs) filter.coeMhs = coeMhs
    if (status) filter.status = status
    const VALID_DAYS = ['mon','tue','wed','thu','fri','sat']
    if (day && VALID_DAYS.includes(day)) filter[day] = { $nin: [null, ''] }
    if (q) {
      const re = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [
        { roomNo: re },
        { mon: re }, { tue: re }, { wed: re },
        { thu: re }, { fri: re }, { sat: re },
        { notes: re },
      ]
    }
    const rooms = (await RoomAllocation.find(filter).sort({ block: 1, floor: 1, slNo: 1 }).lean()).filter(r => isApprovedRoom(r.roomNo))

    const enriched = rooms.map(r => ({
      ...r,
      capacity: approvedRoom(r.roomNo).capacity,
      block: approvedRoom(r.roomNo).block,
      type: approvedRoom(r.roomNo).room_type,
    })).filter(r => (!block || r.block === block) && (!type || r.type === type))

    // Filter options must also come only from approved rooms.
    const allAllocations = (await RoomAllocation.find({}).lean())
      .filter(r => isApprovedRoom(r.roomNo))
    const blocks = [...new Set(allAllocations.map(r => approvedRoom(r.roomNo).block))]
    const types = [...new Set(allAllocations.map(r => approvedRoom(r.roomNo).room_type))]
    const wings = [...new Set(allAllocations.map(r => r.coeMhs).filter(Boolean))]

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
