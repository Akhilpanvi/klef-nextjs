import { createRoomInventoryResolver, getRoomAssignmentDataset, getRoomInventory } from '@/lib/roomAssignments'
import { requireAuth } from '@/lib/auth'
import { connectDB }   from '@/lib/mongodb'
import BoxTTEntry      from '@/lib/models/BoxTTEntry'
import BoxTTSnapshot   from '@/lib/models/BoxTTSnapshot'

const DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const { room } = req.query
  if (!room) return res.status(400).json({ success: false, message: 'room required' })

  await connectDB()
  const assignmentData = await getRoomAssignmentDataset()
  const resolveRoom = createRoomInventoryResolver(getRoomInventory(assignmentData))

  const snap = await BoxTTSnapshot.findOne().lean()
  if (!snap) return res.status(404).json({ success: false, message: 'No Box TT data uploaded' })

  const roomName = resolveRoom(room)
  if (!roomName) return res.status(404).json({ success: false, message: 'Room not in final inventory' })
  const entries  = await BoxTTEntry.find(
    { dataset: snap.snapshotId },
    'room_no day hour label'
  ).lean()
  const roomEntries = entries.filter(entry => resolveRoom(entry.room_no) === roomName)

  if (!roomEntries.length)
    return res.status(404).json({ success: false, message: `Room ${roomName} not found in Box TT` })

  // Build schedule: { Mon: { 1: 'label', 3: 'label' }, ... }
  const schedule = {}
  for (const e of roomEntries) {
    const dk = DAY_KEYS[e.day - 1]
    if (!dk) continue
    if (!schedule[dk]) schedule[dk] = {}
    schedule[dk][e.hour] = e.label
  }

  res.json({ success: true, room: roomName, schedule })
}
