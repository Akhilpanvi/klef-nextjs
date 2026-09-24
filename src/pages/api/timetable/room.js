import { approvedRoom, approvedRoomKey, isApprovedRoom } from '@/lib/approvedRooms'
import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import TimetableEntry from '@/lib/models/TimetableEntry'
import { getActiveDataset } from '@/lib/activeDataset'

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  const user = await requireAuth(req, res)
  if (!user) return

  await connectDB()
  const { q, list, snap } = req.query
  const dataset = snap || await getActiveDataset('live')

  if (list) {
    const rooms  = await TimetableEntry.distinct('room_no', { dataset })
    return res.json({
      success: true,
      rooms: [...new Set(rooms.map(approvedRoomKey).filter(Boolean))].sort().map(r => ({
        number: r,
        block: approvedRoom(r).block,
        type: approvedRoom(r).room_type,
        capacity: approvedRoom(r).capacity,
      })),
    })
  }

  if (!q) return res.status(400).json({ success: false, message: 'q param required' })

  if (!isApprovedRoom(q)) return res.status(404).json({ success: false, message: 'Room not in approved inventory' })

  const names = await TimetableEntry.distinct('room_no', { dataset })
  const matchedNames = names.filter(name => approvedRoomKey(name) === approvedRoomKey(q))
  const entries = await TimetableEntry
    .find({ dataset, room_no: { $in: matchedNames } })
    .lean()

  if (!entries.length)
    return res.status(404).json({ success: false, message: 'Room not found' })

  const meta = approvedRoom(entries[0].room_no)

  res.json({
    success: true,
    room: { number: approvedRoomKey(entries[0].room_no), type: meta?.room_type||'-', capacity: meta?.capacity||'-', block: meta?.block||'-' },
    entries,
  })
}
