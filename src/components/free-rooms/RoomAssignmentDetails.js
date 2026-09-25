import { ASSIGNMENT_DAY_NAMES } from '@/lib/roomAssignmentFormat'

export default function RoomAssignmentDetails({ room }) {
  const day = ASSIGNMENT_DAY_NAMES[room.assignment_day - 1]
  return <div style={{ fontSize: 12, color: 'var(--text-2)', overflowWrap: 'anywhere', lineHeight: 1.6 }}>
    <div><strong>Assigned:</strong> {room.assigned || 'Not specified'}</div>
    {day && <div><strong>{day}:</strong> {room.assigned_for_day || 'Not specified'}</div>}
  </div>
}
