import { createRoomInventoryResolver, getRoomAssignmentDataset, getRoomInventory, roomAssignment } from '@/lib/roomAssignments'
import { requireAuth }  from '@/lib/auth'
import { connectDB }    from '@/lib/mongodb'
import RoomwiseEntry    from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot from '@/lib/models/RoomwiseSnapshot'
import RoomMeta         from '@/lib/models/RoomMeta'
import ErpRoomData      from '@/lib/models/ErpRoomData'

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const dayNum = Number(req.query.day)
  const periodNums = [...new Set(String(req.query.periods || '').split(',').map(Number)
    .filter(period => Number.isInteger(period) && period >= 1 && period <= 24))].sort((a, b) => a - b)
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 6 || !periodNums.length)
    return res.status(400).json({ success: false, message: 'Select a valid Monday-Saturday day and at least one period from 1-24' })

  res.setHeader('Cache-Control', 'private, no-store')

  await connectDB()
  const assignmentData = await getRoomAssignmentDataset()
  const inventory = getRoomInventory(assignmentData)
  const resolveRoom = createRoomInventoryResolver(inventory)
  const inventoryMap = new Map(inventory.map(room => [room.room_no, room]))

  const snap = await RoomwiseSnapshot.findOne().lean()
  if (!snap)
    return res.json({ success: true, count: 0, rooms: [], noData: true,
      message: 'No roomwise timetable uploaded yet.' })

  const dataset    = snap.snapshotId
  const allSections  = await RoomwiseEntry.distinct('room_no', { dataset })
  const busySections = await RoomwiseEntry.distinct('room_no', {
    dataset, day: dayNum, hour: { $in: periodNums },
  })
  const busySet = new Set(busySections.map(resolveRoom).filter(Boolean))

  // Group sections by base room
  const roomSections = {}
  if (assignmentData.uploaded) for (const room of inventory) roomSections[room.room_no] = []
  const unmatchedRoomLabels = []
  const coveredRooms = new Set()
  for (const sec of allSections) {
    const base = resolveRoom(sec)
    if (!base) { unmatchedRoomLabels.push(String(sec)); continue }
    coveredRooms.add(base)
    if (!roomSections[base]) roomSections[base] = []
    roomSections[base].push(sec)
  }

  // Room metadata
  const metas   = await RoomMeta.find({}).lean()
  const metaMap = Object.fromEntries(metas.map(m => [resolveRoom(m.room_no), m]).filter(([key]) => key))

  // ERP room IDs
  const erpDocs  = await ErpRoomData.find({}, 'room_no sections').lean()
  const erpMap   = Object.fromEntries(erpDocs.map(e => [resolveRoom(e.room_no), e.sections || []]).filter(([key]) => key))

  const free = []
  for (const [base, sections] of Object.entries(roomSections)) {
    // Room is free only if ALL sections are free
    const allFree = !busySet.has(base)
    if (!allFree) continue

    const meta = { ...metaMap[base], ...inventoryMap.get(base) }
    free.push({
      ...roomAssignment(base, dayNum, assignmentData.records),
      number:      base,
      erp_sections: erpMap[base] ?? [],
      type:     meta?.room_type  || '?',
      capacity: meta?.capacity   || null,
      floor:    meta?.floor      ?? null,
      block:    meta?.block      || base.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() || '?',
      dept:     meta?.alloted_to || 'General',
    })
  }

  free.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))

  res.json({ success: true, count: free.length, rooms: free,
    diagnostics: {
      inventoryRooms: inventory.length,
      timetableRoomLabels: allSections.length,
      matchedPhysicalRooms: coveredRooms.size,
      unmatchedRoomCount: unmatchedRoomLabels.length,
      unmatchedRoomLabels: unmatchedRoomLabels.sort().slice(0, 25),
      timetableSource: snap.filename || snap.label || dataset,
      roomSource: assignmentData.source,
    },
  })
}
