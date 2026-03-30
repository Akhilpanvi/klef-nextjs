import { requireAuth }  from '@/lib/auth'
import { connectDB }    from '@/lib/mongodb'
import RoomwiseEntry    from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot from '@/lib/models/RoomwiseSnapshot'
import RoomMeta         from '@/lib/models/RoomMeta'
import ErpRoomData      from '@/lib/models/ErpRoomData'

function baseKey(roomNo) {
  return roomNo.split('-')[0].trim().toUpperCase()
}

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const { day, periods } = req.query
  if (!day || !periods)
    return res.status(400).json({ success: false, message: 'day and periods required' })

  await connectDB()

  const snap = await RoomwiseSnapshot.findOne().lean()
  if (!snap)
    return res.json({ success: true, count: 0, rooms: [], noData: true,
      message: 'No roomwise timetable uploaded yet.' })

  const dataset    = snap.snapshotId
  const dayNum     = parseInt(day)
  const periodNums = periods.split(',').map(Number).filter(p => p >= 1 && p <= 24)

  const allSections  = await RoomwiseEntry.distinct('room_no', { dataset })
  const busySections = await RoomwiseEntry.distinct('room_no', {
    dataset, day: dayNum, hour: { $in: periodNums },
  })
  const busySet = new Set(busySections.map(String))

  // Group sections by base room
  const roomSections = {}
  for (const sec of allSections) {
    const base = baseKey(sec)
    if (!roomSections[base]) roomSections[base] = []
    roomSections[base].push(sec)
  }

  // Room metadata
  const metas   = await RoomMeta.find({}).lean()
  const metaMap = Object.fromEntries(metas.map(m => [m.room_no, m]))

  // ERP room IDs
  const erpDocs  = await ErpRoomData.find({}, 'room_no sections').lean()
  const erpMap   = Object.fromEntries(erpDocs.map(e => [e.room_no, e.sections || []]))

  const free = []
  for (const [base, sections] of Object.entries(roomSections)) {
    // Room is free only if ALL sections are free
    const allFree = sections.every(sec => !busySet.has(sec))
    if (!allFree) continue

    const meta = metaMap[base]
    free.push({
      number:      base,
      erp_sections: erpMap[base] ?? [],
      type:     meta?.room_type  || '?',
      capacity: meta?.capacity   || null,
      block:    meta?.block      || base.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() || '?',
      dept:     meta?.alloted_to || 'General',
    })
  }

  free.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))

  res.json({ success: true, count: free.length, rooms: free })
}
