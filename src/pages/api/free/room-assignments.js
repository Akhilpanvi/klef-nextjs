import { requireAuth } from '@/lib/auth'
import { approvedRooms } from '@/lib/approvedRooms'
import { roomAssignment, assignmentSource } from '@/lib/roomAssignments'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' })
  if (!await requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'private, no-store')
  const rooms = approvedRooms.map(room => ({
    number: room.room_no, block: room.block, type: room.room_type, capacity: room.capacity,
    ...roomAssignment(room.room_no),
  })).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
  return res.json({ success: true, source: assignmentSource, rooms })
}
