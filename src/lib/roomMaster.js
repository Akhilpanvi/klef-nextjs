import { approvedRoom, approvedRoomKey } from './approvedRooms.js'
import RoomMeta       from './models/RoomMeta.js'
import RoomAllocation from './models/RoomAllocation.js'
import { WING_BY_ALLOTMENT, DAY_FIELDS }
  from './roomLabel.js'

/**
 * Merge allocation/wing information only for the final approved inventory.
 * Block, type and capacity always come from ROOM DATA.xlsx.
 * Wing-based reports still require a known wing from the uploaded metadata.
 */
export async function buildRoomMaster(dayNums = []) {
  const [metas, allocs] = await Promise.all([
    RoomMeta.find({}, 'room_no alloted_to room_type capacity block').lean(),
    RoomAllocation.find({}).lean(),
  ])

  const room = new Map()
  const put = (key, patch) => {
    if (!key) return
    room.set(key, { ...(room.get(key) || { room: key }), ...patch })
  }

  const excluded = new Map()
  const exclude = (key, patch) => {
    if (!key) return
    excluded.set(key, { ...(excluded.get(key) || { room: key }), ...patch })
  }

  for (const m of metas) {
    const key       = approvedRoomKey(m.room_no)
    const allotment = String(m.alloted_to || '').toUpperCase()
    const wing      = WING_BY_ALLOTMENT[allotment]
    if (!key || !wing) continue

    put(key, { wing, allotment, type: m.room_type || null,
      capacity: m.capacity ?? null, block: m.block || null })
  }

  for (const a of allocs) {
    const key = approvedRoomKey(a.roomNo)
    if (!key) continue

    const existing  = room.get(key)
    const allotment = String(a.coeMhs || '').toUpperCase()
    const wing = existing?.wing || WING_BY_ALLOTMENT[allotment]
    if (!wing) continue

    // What the Room Allocation sheet says the room is for, per selected day.
    const usage = {}
    for (const d of dayNums) {
      const v = a[DAY_FIELDS[d - 1]]
      if (v && String(v).trim()) usage[d] = String(v).trim()
    }
    put(key, {
      wing,
      allotment: existing?.allotment || allotment || wing,
      type:     a.type     ?? existing?.type     ?? null,
      capacity: a.capacity ?? existing?.capacity ?? null,
      block:    a.block    ?? existing?.block    ?? null,
      floor:    a.floor ?? null,
      usage,
      status:   a.status || null,
      notes:    a.notes  || '',
    })
  }

  // Capacity is only final once both sources are merged, hence a pass here.
  for (const [key, info] of room) {
    const approved = approvedRoom(key)
    info.capacity = approved.capacity
    info.type = approved.room_type
    info.block = approved.block
    if (info.capacity) continue
    exclude(key, { ...info, reason: 'No capacity recorded' })
    room.delete(key)
  }

  return { room, excluded, knownRooms: new Set(room.keys()) }
}

/**
 * Rooms held back from the counts, plus any busy room that matched nothing in
 * the master, each with the timetable names that produced it.
 *
 * `unmatched` is Map(resolvedKey -> { raws:Set, sample:string }).
 */
export function buildExcludedReport(excluded, unmatched = new Map()) {
  const report = []
  for (const [key, u] of unmatched) {
    if (!approvedRoom(key)) continue
    const ex = excluded.get(key)
    report.push({
      room: key, reason: ex?.reason || 'Not in room master', occupied: true,
      wing: ex?.wing ?? null, type: ex?.type ?? null, capacity: ex?.capacity ?? null,
      block: ex?.block ?? null, floor: ex?.floor ?? null,
      timetableNames: [...u.raws].sort(), sample: u.sample,
    })
  }
  for (const [key, ex] of excluded) {
    if (unmatched.has(key)) continue
    report.push({
      room: key, reason: ex.reason, occupied: false,
      wing: ex.wing ?? null, type: ex.type ?? null, capacity: ex.capacity ?? null,
      block: ex.block ?? null, floor: ex.floor ?? null,
      timetableNames: [], sample: '',
    })
  }
  report.sort((a, b) =>
    a.reason.localeCompare(b.reason) ||
    a.room.localeCompare(b.room, undefined, { numeric: true }))
  return report
}
