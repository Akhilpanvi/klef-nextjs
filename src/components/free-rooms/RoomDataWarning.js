'use client'

export default function RoomDataWarning({ diagnostics }) {
  if (!diagnostics?.unmatchedRoomCount) return null
  const labels = diagnostics.unmatchedRoomLabels || []
  return <div role="alert" style={{
    margin: '14px 0', padding: '11px 13px', borderRadius: 8,
    color: '#92400e', background: '#fffbeb', border: '1px solid #f59e0b', fontSize: 12,
  }}>
    <strong>{diagnostics.unmatchedRoomCount} timetable room label{diagnostics.unmatchedRoomCount === 1 ? '' : 's'} did not match the final Room Department Assignments.</strong>
    {' '}They were excluded. Check these room names in both uploaded files
    {labels.length ? `: ${labels.join(', ')}${diagnostics.unmatchedRoomCount > labels.length ? ', ...' : ''}` : '.'}
  </div>
}
