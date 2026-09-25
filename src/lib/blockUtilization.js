import { approvedRooms, approvedRoomKey } from './approvedRooms.js'

export const UTILIZATION_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const UTILIZATION_PERIODS = Array.from({ length: 11 }, (_, i) => i + 1)
const pct = (busy, total) => total ? Math.round(busy / total * 1000) / 10 : null
const byRoom = (a, b) => a.localeCompare(b, undefined, { numeric: true })

/** One occupied physical room counts once per slot, regardless of ERP sections. */
export function buildBlockUtilization(entries, observedRooms, inventory = approvedRooms, resolveRoom = approvedRoomKey) {
  const covered = new Set(observedRooms.map(resolveRoom).filter(Boolean))
  const busy = new Map()
  for (const entry of entries) {
    const room = resolveRoom(entry.room_no)
    const day = Number(entry.day), hour = Number(entry.hour)
    if (!room || !covered.has(room) || !Number.isInteger(day) || !Number.isInteger(hour) ||
        day < 1 || day > 6 || hour < 1 || hour > 11) continue
    const key = `${day}:${hour}`
    if (!busy.has(key)) busy.set(key, new Set())
    busy.get(key).add(room)
  }

  const grouped = new Map()
  for (const room of inventory) {
    if (!grouped.has(room.block)) grouped.set(room.block, [])
    grouped.get(room.block).push(room.room_no)
  }
  const blocks = [...grouped].sort(([a], [b]) => byRoom(a, b)).map(([block, roomNames]) => {
    const rooms = roomNames.sort(byRoom)
    const tracked = rooms.filter(room => covered.has(room))
    const missingRooms = rooms.filter(room => !covered.has(room))
    const days = UTILIZATION_DAYS.map((name, index) => {
      const day = index + 1
      const periods = UTILIZATION_PERIODS.map(hour => {
        const occupiedRooms = tracked.filter(room => busy.get(`${day}:${hour}`)?.has(room))
        const freeRooms = tracked.filter(room => !busy.get(`${day}:${hour}`)?.has(room))
        return { hour, occupied: occupiedRooms.length, free: freeRooms.length,
          utilization: pct(occupiedRooms.length, tracked.length), occupiedRooms, freeRooms }
      })
      const occupiedSlots = periods.reduce((sum, period) => sum + period.occupied, 0)
      const totalSlots = tracked.length * 11
      return { day, name, periods, occupiedSlots, totalSlots, utilization: pct(occupiedSlots, totalSlots) }
    })
    const occupiedSlots = days.reduce((sum, day) => sum + day.occupiedSlots, 0)
    const totalSlots = tracked.length * 66
    return { block, roomCount: rooms.length, coveredRooms: tracked.length, missingRooms, days,
      occupiedSlots, freeSlots: totalSlots - occupiedSlots, totalSlots,
      utilization: pct(occupiedSlots, totalSlots) }
  })
  const occupiedSlots = blocks.reduce((sum, block) => sum + block.occupiedSlots, 0)
  const totalSlots = covered.size * 66
  return { blocks, totals: {
    roomCount: inventory.length, coveredRooms: covered.size,
    missingRooms: inventory.length - covered.size, occupiedSlots,
    freeSlots: totalSlots - occupiedSlots, totalSlots,
    utilization: pct(occupiedSlots, totalSlots),
  } }
}
