import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import { createRoomInventoryResolver, getRoomAssignmentDataset, getRoomInventory, roomAssignment } from '@/lib/roomAssignments'
import RoomwiseEntry from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot from '@/lib/models/RoomwiseSnapshot'

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const day = Number(req.query.day)
  const hour = Number(req.query.hour)
  if (!Number.isInteger(day) || day < 1 || day > 6 || !Number.isInteger(hour) || hour < 1 || hour > 24)
    return res.status(400).json({ success: false, message: 'Select a valid Monday-Saturday day and hour from 1-24' })

  res.setHeader('Cache-Control', 'private, no-store')
  await connectDB()

  const [assignmentData, snapshot] = await Promise.all([
    getRoomAssignmentDataset(),
    RoomwiseSnapshot.findOne().lean(),
  ])
  if (!snapshot)
    return res.json({ success: true, noData: true, rooms: [], message: 'No Roomwise timetable uploaded yet.' })

  const inventory = getRoomInventory(assignmentData)
  const resolveRoom = createRoomInventoryResolver(inventory)
  const [roomLabels, slotEntries] = await Promise.all([
    RoomwiseEntry.distinct('room_no', { dataset: snapshot.snapshotId }),
    RoomwiseEntry.find({ dataset: snapshot.snapshotId, day, hour }, 'room_no label').lean(),
  ])

  const covered = new Set(roomLabels.map(resolveRoom).filter(Boolean))
  const classesByRoom = new Map()
  for (const entry of slotEntries) {
    const room = resolveRoom(entry.room_no)
    if (!room) continue
    const label = String(entry.label || '').trim()
    if (!label) continue
    if (!classesByRoom.has(room)) classesByRoom.set(room, new Set())
    classesByRoom.get(room).add(label)
  }

  const rooms = inventory.map(meta => {
    const classes = [...(classesByRoom.get(meta.room_no) || [])]
    const hasCoverage = covered.has(meta.room_no)
    return {
      ...roomAssignment(meta.room_no, day, assignmentData.records),
      number: meta.room_no,
      block: meta.block || meta.room_no.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() || '?',
      floor: meta.floor ?? null,
      type: meta.room_type || '?',
      capacity: meta.capacity || null,
      classes,
      status: !hasCoverage ? 'no_data' : classes.length > 1 ? 'clash' : classes.length === 1 ? 'occupied' : 'free',
    }
  }).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))

  res.json({
    success: true,
    day,
    hour,
    rooms,
    counts: {
      total: rooms.length,
      free: rooms.filter(room => room.status === 'free').length,
      occupied: rooms.filter(room => room.status === 'occupied').length,
      clashes: rooms.filter(room => room.status === 'clash').length,
      noData: rooms.filter(room => room.status === 'no_data').length,
    },
    diagnostics: {
      timetableSource: snapshot.filename || snapshot.label || snapshot.snapshotId,
      roomSource: assignmentData.source,
    },
  })
}
