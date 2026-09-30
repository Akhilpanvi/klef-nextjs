'use client'

export default function RoomDataWarning({ diagnostics }) {
  if (!diagnostics?.unmatchedRoomCount && !diagnostics?.uncoveredInventoryRoomCount) return null
  const labels = diagnostics.unmatchedRoomLabels || []
  const uncovered = diagnostics.uncoveredInventoryRooms || []
  return <div role="alert" style={{
    margin: '14px 0', padding: '11px 13px', borderRadius: 8,
    color: '#92400e', background: '#fffbeb', border: '1px solid #f59e0b', fontSize: 12,
  }}>
    {!!diagnostics.unmatchedRoomCount && <div>
      <strong>{diagnostics.unmatchedRoomCount} timetable room label{diagnostics.unmatchedRoomCount === 1 ? '' : 's'} did not match the final Room Department Assignments.</strong>
      {' '}They were excluded. Check these room names in both uploaded files
      {labels.length ? `: ${labels.join(', ')}${diagnostics.unmatchedRoomCount > labels.length ? ', ...' : ''}` : '.'}
    </div>}
    {!!diagnostics.uncoveredInventoryRoomCount && <div style={{ marginTop: diagnostics.unmatchedRoomCount ? 8 : 0 }}>
      <strong>{diagnostics.uncoveredInventoryRoomCount} final room{diagnostics.uncoveredInventoryRoomCount === 1 ? '' : 's'} have no entry in the Roomwise Timetable.</strong>
      {' '}They are excluded because their availability cannot be verified
      {uncovered.length ? `: ${uncovered.join(', ')}${diagnostics.uncoveredInventoryRoomCount > uncovered.length ? ', ...' : ''}` : '.'}
    </div>}
  </div>
}
