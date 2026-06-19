import { requireAuth }      from '@/lib/auth'
import { connectDB }        from '@/lib/mongodb'
import TimetableEntry       from '@/lib/models/TimetableEntry'
import TimetableSnapshot    from '@/lib/models/TimetableSnapshot'
import RoomMeta             from '@/lib/models/RoomMeta'
import ErpRoomData          from '@/lib/models/ErpRoomData'

const LIVE_DATASET = 'gsheet_live'

function baseKey(r) {
  return (r || '').split('-')[0].trim().toUpperCase()
}

// No letter → raw ERP room ID (1-digit, 4-digit, any length); has letter → readable room name
function hasNoLetter(r) {
  return !/[a-zA-Z]/.test((r || '').trim())
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

  // Prefer gsheet_live; fall back to active BTT snapshot
  let snap = await TimetableSnapshot.findOne({ snapshotId: LIVE_DATASET }).lean()
  let dataset = LIVE_DATASET

  if (!snap) {
    snap = await TimetableSnapshot.findOne({ isActive: true, type: 'live' }).lean()
    dataset = snap?.snapshotId
  }

  if (!snap || !dataset)
    return res.json({
      success: true, count: 0, rooms: [], noData: true,
      message: 'Live timetable not available. Ask admin to sync Google Sheets or upload a BTT CSV.',
    })

  const dayNum     = parseInt(day)
  const periodNums = periods.split(',').map(Number).filter(p => p >= 1 && p <= 24)

  // All distinct rooms in dataset
  const allRooms = await TimetableEntry.distinct('room_no', {
    dataset, room_no: { $nin: [null, ''] },
  })

  // Rooms occupied in the requested slots
  const busyRooms = await TimetableEntry.distinct('room_no', {
    dataset,
    umatdayid:   dayNum,
    umat_hourno: { $in: periodNums },
    room_no:     { $nin: [null, ''] },
  })
  // Enrich with RoomMeta + ERP IDs
  const [metas, erpDocs] = await Promise.all([
    RoomMeta.find({}, 'room_no block room_type capacity alloted_to').lean(),
    ErpRoomData.find({}, 'room_no erp_id sections').lean(),
  ])
  const metaMap = Object.fromEntries(metas.map(m => [m.room_no, m]))
  const erpMap  = Object.fromEntries(erpDocs.map(e => [e.room_no, e.sections || []]))

  // Reverse map: numeric ERP ID → readable room name (e.g. 3952 → "C019")
  const erpIdToName = {}
  for (const e of erpDocs) {
    if (e.erp_id) erpIdToName[String(e.erp_id)] = e.room_no
    for (const s of e.sections || []) {
      if (s.erp_id) erpIdToName[String(s.erp_id)] = e.room_no
    }
  }

  // If value has no letter → look up ERP ID map; otherwise use as room name directly
  function resolve(raw) {
    const s = (raw || '').trim()
    if (hasNoLetter(s) && erpIdToName[s]) return erpIdToName[s]
    return baseKey(s)
  }

  // Re-group using resolved names (in case some room_no values were numeric ERP IDs)
  const resolved = {}
  for (const sec of allRooms) {
    const name = resolve(String(sec))
    if (!resolved[name]) resolved[name] = []
    resolved[name].push(String(sec))
  }

  // Rebuild busy set using resolved names
  const resolvedBusySet = new Set(busyRooms.map(r => resolve(String(r))))

  const free = []
  for (const [name, rawSecs] of Object.entries(resolved)) {
    if (rawSecs.some(s => resolvedBusySet.has(resolve(s)))) continue

    const meta = metaMap[name]
    free.push({
      number:       name,
      erp_sections: erpMap[name] ?? [],
      type:         meta?.room_type || '?',
      capacity:     meta?.capacity  || null,
      block:        meta?.block     || name.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() || '?',
      dept:         meta?.alloted_to || 'General',
    })
  }

  free.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))

  return res.json({
    success: true, count: free.length, rooms: free,
    dataset, isLive: dataset === LIVE_DATASET,
    syncedAt: snap.uploadedAt, label: snap.label || dataset,
  })
}
