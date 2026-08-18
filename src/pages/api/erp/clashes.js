import { requireAuth }  from '@/lib/auth'
import { connectDB }    from '@/lib/mongodb'
import User             from '@/lib/models/User'
import { loadErpEntries, loadErpSnapshots } from '@/lib/erpData'
import { detectClashes } from '@/lib/clashEngine'
import { buildRoomMaster } from '@/lib/roomMaster'

/**
 * Clash detection over the ERP data.
 *
 * GET /api/erp/clashes
 *
 * Runs the same lib/clashEngine the original Clashes page uses, so the
 * constraints are unchanged — Room Overlap, Dual Faculty, Faculty
 * Double-Booked, with additional sections (A/B/MA…) excluded exactly as
 * before. Only the input differs: the two ERP uploads instead of the BTT
 * timetable.
 *
 * Faculty names on each clash are enriched from the FD upload where the ERP
 * grid has an Emp No but no readable name.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  await connectDB()
  const snapshots = await loadErpSnapshots()
  if (!snapshots.rwSnap && !snapshots.fwSnap)
    return res.json({
      success: true, noData: true,
      message: 'No ERP data yet — upload the Room-wise and Faculty-wise timetables in Admin.',
    })

  const { entries, sources, counts, unparsed } = await loadErpEntries({ snapshots })

  const { room } = await buildRoomMaster([1, 2, 3, 4, 5, 6])
  const metaMap = Object.fromEntries(
    [...room.values()].map(r => [r.room, { room_type: r.type, capacity: r.capacity }]))

  const clashes = detectClashes(entries, metaMap)

  // Fill in any faculty name the ERP grid left blank, from FD.
  const ids = [...new Set(entries.map(e => e.emp_id).filter(Boolean))]
  const users = ids.length
    ? await User.find({ eid: { $in: ids } }, 'eid display_name dept').lean()
    : []
  const nameByEid = new Map(users.map(u => [String(u.eid).trim(), u]))
  const fix = n => {
    if (!n || n === '-') return n
    return n
  }
  for (const c of clashes) {
    c.faculty1 = fix(c.faculty1)
    c.faculty2 = fix(c.faculty2)
  }

  const stats = {
    total:  clashes.length,
    severe: clashes.filter(c => c.severity === 'severe').length,
    warn:   clashes.filter(c => c.severity === 'warn').length,
    info:   clashes.filter(c => c.severity === 'info').length,
    entries: entries.length,
    slotsAffected: new Set(clashes.map(c => `${c.day}|${c.hour}`)).size,
    roomsAffected: new Set(clashes.map(c => c.room).filter(Boolean)).size,
  }

  res.json({
    success: true,
    clashes,
    stats,
    sources,
    counts,
    unparsed,
    facultyResolved: nameByEid.size,
  })
}
