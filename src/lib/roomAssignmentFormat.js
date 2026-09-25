export const ASSIGNMENT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export const ASSIGNMENT_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function assignmentExportColumns(room) {
  return {
    Assigned: room.assigned || 'Not specified',
    ...Object.fromEntries(ASSIGNMENT_DAYS.map((day, index) => [ASSIGNMENT_DAY_NAMES[index], room.day_assignments?.[day] || 'Not specified'])),
  }
}
