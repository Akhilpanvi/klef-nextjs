import { createRoomInventoryResolver, getRoomAssignmentDataset, getRoomInventory, roomAssignment } from '@/lib/roomAssignments'
import { requireAuth } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import RoomwiseEntry from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot from '@/lib/models/RoomwiseSnapshot'
import RoomMeta from '@/lib/models/RoomMeta'

const byRoom = (a, b) => a.localeCompare(b, undefined, { numeric: true })
const percent = (used, total) => total ? Math.round(used / total * 1000) / 10 : null

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' })
  if (!await requireAuth(req, res)) return

  const day = Number(req.query.day)
  const periods = [...new Set(String(req.query.periods || '').split(',').map(Number)
    .filter(value => Number.isInteger(value) && value >= 1 && value <= 24))].sort((a, b) => a - b)
  if (!Number.isInteger(day) || day < 1 || day > 6 || !periods.length)
    return res.status(400).json({ success: false, message: 'A valid day and at least one period are required' })

  await connectDB()
  const snapshot = await RoomwiseSnapshot.findOne().lean()
  if (!snapshot) return res.json({ success: true, noData: true, rooms: [],
    message: 'No roomwise timetable uploaded yet.' })

  const assignmentData = await getRoomAssignmentDataset()
  const inventory = getRoomInventory(assignmentData)
  const resolveRoom = createRoomInventoryResolver(inventory)
  const inventoryMap = new Map(inventory.map(room => [room.room_no, room]))
  const dataset = snapshot.snapshotId
  const [allSections, busySections, metas] = await Promise.all([
    RoomwiseEntry.distinct('room_no', { dataset }),
    RoomwiseEntry.distinct('room_no', { dataset, day, hour: { $in: periods } }),
    RoomMeta.find({}).lean(),
  ])
  const busy = new Set(busySections.map(resolveRoom).filter(Boolean))
  const unmatchedRoomLabels = allSections.filter(section => !resolveRoom(section)).map(String).sort()
  const observed = [...new Set(allSections.map(resolveRoom).filter(Boolean))]
  const roomNames = assignmentData.uploaded ? inventory.map(room => room.room_no) : observed
  const metaMap = new Map(metas.map(meta => [resolveRoom(meta.room_no), meta]).filter(([key]) => key))

  const rooms = roomNames.map(number => {
    const meta = { ...metaMap.get(number), ...inventoryMap.get(number) }
    const rawCapacity = Number(meta.capacity)
    const capacity = Number.isFinite(rawCapacity) && rawCapacity > 0 ? rawCapacity : null
    return {
      number,
      block: meta.block || number.match(/^[A-Za-z&]+/)?.[0]?.toUpperCase() || '?',
      floor: meta.floor ?? null,
      type: meta.room_type || '?',
      capacity,
      status: busy.has(number) ? 'occupied' : 'free',
      ...roomAssignment(number, day, assignmentData.records),
    }
  }).sort((a, b) => byRoom(a.number, b.number))

  const known = rooms.filter(room => room.capacity != null)
  const occupied = rooms.filter(room => room.status === 'occupied')
  const free = rooms.filter(room => room.status === 'free')
  const totalCapacity = known.reduce((sum, room) => sum + room.capacity, 0)
  const occupiedCapacity = occupied.reduce((sum, room) => sum + (room.capacity || 0), 0)
  const freeCapacity = free.reduce((sum, room) => sum + (room.capacity || 0), 0)

  const capacityMap = new Map()
  for (const room of rooms) {
    const key = room.capacity ?? 'Unknown'
    const group = capacityMap.get(key) || { capacity: room.capacity, rooms: 0, occupied: 0, free: 0,
      totalSeats: 0, occupiedSeats: 0, freeSeats: 0 }
    group.rooms++
    group[room.status]++
    if (room.capacity) {
      group.totalSeats += room.capacity
      group[room.status === 'occupied' ? 'occupiedSeats' : 'freeSeats'] += room.capacity
    }
    capacityMap.set(key, group)
  }
  const capacityGroups = [...capacityMap.values()]
    .map(group => ({ ...group, occupancy: percent(group.occupiedSeats, group.totalSeats) }))
    .sort((a, b) => a.capacity == null ? 1 : b.capacity == null ? -1 : a.capacity - b.capacity)

  res.setHeader('Cache-Control', 'private, no-store')
  return res.json({
    success: true, day, periods, rooms, capacityGroups,
    totals: {
      rooms: rooms.length, occupiedRooms: occupied.length, freeRooms: free.length,
      roomsWithoutCapacity: rooms.length - known.length,
      totalCapacity, occupiedCapacity, freeCapacity,
      roomOccupancy: percent(occupied.length, rooms.length),
      capacityOccupancy: percent(occupiedCapacity, totalCapacity),
    },
    snapshotLabel: snapshot.label || snapshot.filename || dataset,
    filename: snapshot.filename || null,
    uploadedAt: snapshot.uploadedAt || null,
    assignmentSource: assignmentData.source,
    diagnostics: {
      inventoryRooms: inventory.length,
      timetableRoomLabels: allSections.length,
      matchedPhysicalRooms: observed.length,
      unmatchedRoomCount: unmatchedRoomLabels.length,
      unmatchedRoomLabels: unmatchedRoomLabels.slice(0, 25),
    },
  })
}
