import data from './data/roomAssignments.json'
import { approvedRoomKey } from './approvedRooms.js'
import RoomAssignment from './models/RoomAssignment.js'
import RoomAssignmentSnapshot from './models/RoomAssignmentSnapshot.js'

export const assignmentSource = data.source
const bundledRecords = new Map(data.rooms.map(room => [room.room_no, room]))
const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export async function getRoomAssignmentDataset() {
  const snapshot = await RoomAssignmentSnapshot.findOne({ key: 'active' }).lean()
  if (!snapshot) return { records: bundledRecords, source: assignmentSource, uploaded: false, snapshot: null }
  const docs = await RoomAssignment.find({ dataset: snapshot.dataset }, 'room_no assigned day_assignments').lean()
  return { records: new Map(docs.map(room => [room.room_no, room])), source: snapshot.filename,
    uploaded: true, snapshot }
}

export function roomAssignment(raw, day, records = bundledRecords) {
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
