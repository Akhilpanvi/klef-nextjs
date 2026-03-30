import { requireAuth }   from '@/lib/auth'
import { connectDB }     from '@/lib/mongodb'
import RoomwiseEntry     from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot  from '@/lib/models/RoomwiseSnapshot'
import RoomMeta          from '@/lib/models/RoomMeta'
import ErpRoomData       from '@/lib/models/ErpRoomData'

function baseKey(roomNo) { return roomNo.split('-')[0].trim().toUpperCase() }

const DAY_KEYS   = ['Mon','Tue','Wed','Thu','Fri','Sat']
const MAX_PERIOD = 11
const TOTAL_SLOTS = 6 * MAX_PERIOD // 66

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  await connectDB()

  const snap = await RoomwiseSnapshot.findOne().lean()
  if (!snap) return res.json({ success: true, stats: [], noData: true })

  const dataset = snap.snapshotId

  // Only fetch entries for periods 1-11
  const entries = await RoomwiseEntry.find(
    { dataset, hour: { $lte: MAX_PERIOD } },
    'room_no day hour'
  ).lean()

  const allSections = [...new Set(entries.map(e => e.room_no))]
  const roomSections = {}
  for (const sec of allSections) {
    const base = baseKey(sec)
    if (!roomSections[base]) roomSections[base] = new Set()
    roomSections[base].add(sec)
  }

  // Also get all sections even if they have no entries in 1-11
  const allSectionsTotal = await RoomwiseEntry.distinct('room_no', { dataset })
  for (const sec of allSectionsTotal) {
    const base = baseKey(sec)
    if (!roomSections[base]) roomSections[base] = new Set()
    roomSections[base].add(sec)
  }

  const busyLookup = {}
  for (const e of entries) {
    const base = baseKey(e.room_no)
    if (!busyLookup[base]) busyLookup[base] = {}
    const dk = `${e.day}`
    if (!busyLookup[base][dk]) busyLookup[base][dk] = new Set()
    busyLookup[base][dk].add(e.hour)
  }

  const metas   = await RoomMeta.find({}).lean()
  const metaMap = Object.fromEntries(metas.map(m => [m.room_no, m]))

  const erpDocs = await ErpRoomData.find({}, 'room_no sections').lean()
  const erpMap  = Object.fromEntries(erpDocs.map(e => [e.room_no, e.sections || []]))

  const stats = []
  for (const [base, sectionsSet] of Object.entries(roomSections)) {
    const meta   = metaMap[base]
    const dayBusy = busyLookup[base] || {}

    const dayStats  = {}
    const dayCounts = {}
    for (let d = 1; d <= 6; d++) {
      const busy = (dayBusy[`${d}`] || new Set()).size
      dayCounts[DAY_KEYS[d-1]] = busy
      dayStats[DAY_KEYS[d-1]]  = Math.round((busy / MAX_PERIOD) * 100)
    }

    const hourStats = {}
    for (let h = 1; h <= MAX_PERIOD; h++) {
      let count = 0
      for (let d = 1; d <= 6; d++) {
        if ((dayBusy[`${d}`] || new Set()).has(h)) count++
      }
      hourStats[h] = { count, pct: Math.round((count / 6) * 100) }
    }

    const totalBusy = Object.values(dayCounts).reduce((a,b) => a+b, 0)
    const weeklyPct = Math.round((totalBusy / TOTAL_SLOTS) * 100)

    stats.push({
      number:       base,
      erp_sections: erpMap[base] ?? [],
      type:      meta?.room_type  || '?',
      capacity:  meta?.capacity   || null,
      block:     meta?.block      || base.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() || '?',
      dept:      meta?.alloted_to || 'General',
      weeklyPct,
      totalBusy,
      dayStats,
      dayCounts,
      hourStats,
    })
  }

  stats.sort((a,b) => b.weeklyPct - a.weeklyPct)
  res.json({ success: true, stats, snapshotLabel: snap.label })
}
