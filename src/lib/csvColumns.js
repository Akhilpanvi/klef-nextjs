/**
 * csvColumns
 * ──────────
 * CSV header aliases for the BTT / Google-Sheet parser.
 *
 * Kept separate from csvParser so client components can import the mapping
 * without pulling papaparse into the browser bundle.
 *
 * Each app field lists the accepted header names, newest spelling first. The
 * BTT export was renamed (Course code -> coursecode, EMP ID -> uni_id,
 * R-CAP -> ROOM_CAP, ...); both spellings are accepted so older files still
 * upload, and the first alias present on a row wins.
 */
export const DEFAULT_COLUMNS = {
  department:    ['DEPT'],
  regulation:    ['REG'],
  year:          ['YEAR'],
  courseCode:    ['coursecode', 'Course code'],
  courseName:    ['C_NAME', 'C-Name', 'COURSE NAME', 'course_name'],
  cocssiid:      ['cocssiid'],
  deliveryComp:  ['coursedeliverycomponent'],
  offeredBy:     ['offerred_by_deptid', 'offered_by_deptid'],
  offeredTo:     ['offered_to_deptid'],
  sectionNo:     ['main_sectionno'],
  subSection:    ['associative_sectionno'],
  empId:         ['uni_id', 'EMP ID'],
  facultySeq:    ['faculty_seq'],
  secCount:      ['SEC COUNT'],
  day:           ['umatdayid'],
  hour:          ['umat_hourno'],
  classroomNo:   ['umat_classroomno'],
  roomNo:        ['ROOM NO'],
  roomCap:       ['ROOM_CAP', 'R-CAP'],
  roomDiff:      ['DIFF_CAP', 'R-DIFF'],
  roomType:      ['TYPE', 'R-TYPE'],
  roomCon:       ['ROOM_CON', 'ROOM CON', 'CON'],
  facultyName:   ['F-Name'],
  facultyDept:   ['F-Dept'],
  facultyCohort: ['F_COHORT', 'F-Cohort', 'FACULTY COHORT', 'COHORT'],
  academicYear:  ['umat_academic_year_id'],
  semester:      ['umat_semester_id'],
  srcD:          ['SRC_DATA', 'SRC-D'],
  fctt:          ['FCTT'],
  rctt:          ['RCTT'],
}

// Fields marked REQ in the upload spec.
export const REQUIRED_FIELDS = [
  'department', 'empId', 'day', 'hour', 'roomNo', 'facultyName', 'facultyDept',
]

/** Human labels, also used by the Admin editor and the upload preview. */
export const FIELD_LABELS = {
  department: 'Department', regulation: 'Regulation', year: 'Year',
  courseCode: 'Course Code', courseName: 'Course Name', cocssiid: 'COCSSI ID',
  deliveryComp: 'Delivery Component (L/T/P/S)', offeredBy: 'Offered By Dept ID',
  offeredTo: 'Offered To Dept ID', sectionNo: 'Section No', subSection: 'Sub Section',
  empId: 'Employee ID', facultySeq: 'Faculty Seq', secCount: 'Section Count',
  day: 'Day', hour: 'Period / Hour', classroomNo: 'Classroom No',
  roomNo: 'Room No', roomCap: 'Room Cap', roomDiff: 'Room Diff',
  roomType: 'Room Type', roomCon: 'Room Con', facultyName: 'Faculty Name',
  facultyDept: 'Faculty Dept', facultyCohort: 'Faculty Cohort',
  academicYear: 'Academic Year ID', semester: 'Semester ID', srcD: 'Source Data',
  fctt: 'FCTT', rctt: 'RCTT',
}

/**
 * Merge stored overrides over the defaults. Only fields present in the
 * override are replaced, so a partial mapping stays valid.
 */
export function resolveColumns(overrides) {
  if (!overrides) return DEFAULT_COLUMNS
  const merged = { ...DEFAULT_COLUMNS }
  for (const [field, names] of Object.entries(overrides)) {
    if (!(field in DEFAULT_COLUMNS)) continue
    const list = (Array.isArray(names) ? names : [names])
      .map(n => String(n || '').trim()).filter(Boolean)
    if (list.length) merged[field] = list
  }
  return merged
}

/**
 * Which alias of each field a file actually uses.
 * Returns [{ field, label, required, aliases, matched, missing }].
 */
export function describeHeaders(headers = [], columns = DEFAULT_COLUMNS) {
  return Object.keys(columns).map(field => {
    const aliases = columns[field] || []
    const matched = aliases.find(n => headers.includes(n)) || null
    return {
      field,
      label:    FIELD_LABELS[field] || field,
      required: REQUIRED_FIELDS.includes(field),
      aliases,
      matched,
      missing:  !matched,
    }
  })
}
