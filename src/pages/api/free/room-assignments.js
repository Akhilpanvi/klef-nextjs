import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import { approvedRooms } from '@/lib/approvedRooms'
import { getRoomAssignmentDataset, roomAssignment } from '@/lib/roomAssignments'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' })
  if (!await requireAuth(req, res)) return
  await connectDB()
  const assignmentData = await getRoomAssignmentDataset()
  res.setHeader('Cache-Control', 'private, no-store')
  const rooms = approvedRooms.map(room => ({
    number: room.room_no, block: room.block, type: room.room_type, capacity: room.capacity,
    ...roomAssignment(room.room_no, null, assignmentData.records),
  })).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
  return res.json({ success: true, source: assignmentData.source, uploaded: assignmentData.uploaded,
    uploadedAt: assignmentData.snapshot?.uploadedAt ?? null, rooms })
}
