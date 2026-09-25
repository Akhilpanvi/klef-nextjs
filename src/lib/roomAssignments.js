import data from './data/roomAssignments.json'
import { approvedRoomKey } from './approvedRooms.js'

export const assignmentSource = data.source
const records = new Map(data.rooms.map(room => [room.room_no, room]))
const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function roomAssignment(raw, day) {
  const record = records.get(approvedRoomKey(raw))
  const dayNumber = Number(day)
  const key = Number.isInteger(dayNumber) ? days[dayNumber - 1] : null
  return {
    assigned: record?.assigned ?? null,
    day_assignments: record?.day_assignments ?? Object.fromEntries(days.map(day => [day, null])),
    assignment_day: key ? dayNumber : null,
    assigned_for_day: key ? record?.day_assignments[key] ?? null : null,
    has_assignment_data: Boolean(record),
  }
}
