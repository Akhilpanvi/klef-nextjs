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
  const hours = [...new Set(String(req.query.hours || req.query.hour || '').split(',').map(Number)
    .filter(hour => Number.isInteger(hour) && hour >= 1 && hour <= 24))].sort((a, b) => a - b)
  if (!Number.isInteger(day) || day < 1 || day > 6 || !hours.length || hours.length > 2)
    return res.status(400).json({ success: false, message: 'Select a valid Monday-Saturday day and one or two hours from 1-24' })

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
    RoomwiseEntry.find({ dataset: snapshot.snapshotId, day, hour: { $in: hours } }, 'room_no hour label').lean(),
  ])

  const covered = new Set(roomLabels.map(resolveRoom).filter(Boolean))
  const classesByRoom = new Map()
  for (const entry of slotEntries) {
    const room = resolveRoom(entry.room_no)
    if (!room) continue
    const label = String(entry.label || '').trim()
    if (!label) continue
    if (!classesByRoom.has(room)) classesByRoom.set(room, new Map())
    const byHour = classesByRoom.get(room)
    if (!byHour.has(entry.hour)) byHour.set(entry.hour, new Set())
    byHour.get(entry.hour).add(label)
  }

  const rooms = inventory.map(meta => {
    const byHour = classesByRoom.get(meta.room_no) || new Map()
    const hoursByClass = new Map()
    for (const [hour, labels] of byHour.entries()) {
      for (const label of labels) {
        if (!hoursByClass.has(label)) hoursByClass.set(label, [])
        hoursByClass.get(label).push(hour)
      }
    }
    const classes = [...hoursByClass.entries()].map(([label, classHours]) => ({
      label,
      hours: [...new Set(classHours)].sort((a, b) => a - b),
    })).sort((a, b) => a.hours[0] - b.hours[0] || a.label.localeCompare(b.label))
    const hasClash = [...byHour.values()].some(labels => labels.size > 1)
    const hasCoverage = covered.has(meta.room_no)
    return {
      ...roomAssignment(meta.room_no, day, assignmentData.records),
      number: meta.room_no,
      block: meta.block || meta.room_no.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() || '?',
      floor: meta.floor ?? null,
      type: meta.room_type || '?',
      capacity: meta.capacity || null,
      classes,
      status: !hasCoverage ? 'no_data' : hasClash ? 'clash' : classes.length ? 'occupied' : 'free',
    }
  }).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))

  res.json({
    success: true,
    day,
    hours,
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
