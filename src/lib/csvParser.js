import Papa from 'papaparse'

/**
 * parseBTTBuffer(buffer)
 * ──────────────────────
 * Parses the BTT timetable CSV buffer.
 * Handles:
 *  • UTF-8 BOM
 *  • Rows where the DEPT column is a filename (not skipped — stored as source_file)
 *  • Empty/invalid rows (umatdayid must be 1-6, umat_hourno must be numeric)
 *  • F-Dept casing normalisation
 *
 * Returns an array of objects ready for MongoDB bulk insert.
 */
/**
 * Column aliases, newest name first.
 *
 * The BTT export was renamed (Course code -> coursecode, EMP ID -> uni_id,
 * R-CAP -> ROOM_CAP, and so on). Both spellings are accepted so older files
 * still upload; the first alias present on a row wins.
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

/** Human labels for the Admin editor. */
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

/** First alias with a non-empty value, as a trimmed string. */
const pickFrom = (cols, row, field) => {
  for (const name of cols[field] || []) {
    const v = row[name]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

/** Same, parsed as an integer. Keeps 0 rather than turning it into null. */
const pickIntFrom = (cols, row, field) => {
  const n = parseInt(pickFrom(cols, row, field), 10)
  return Number.isNaN(n) ? null : n
}

/** Which alias of each required field the file actually uses. */
function checkHeaders(headers, cols) {
  const missing = []
  for (const field of REQUIRED_FIELDS) {
    if (!(cols[field] || []).some(n => headers.includes(n))) {
      missing.push(`${field} (expected one of: ${(cols[field] || []).join(' / ')})`)
    }
  }
  return missing
}

export function parseBTTBuffer(buffer, dataset = 'live', columnOverrides = null) {
  const COLUMNS = resolveColumns(columnOverrides)
  const pick    = (row, field) => pickFrom(COLUMNS, row, field)
  const pickInt = (row, field) => pickIntFrom(COLUMNS, row, field)

  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '') // strip BOM

  const { data } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  })

  const warnings = []

  // Validate headers before processing rows
  const headers = data.length > 0 ? Object.keys(data[0]) : []
  const missingCols = checkHeaders(headers, COLUMNS)
  if (missingCols.length) {
    warnings.push(`Missing required columns: ${missingCols.join('; ')}`)
    warnings.push(`Columns found in file: ${headers.join(', ')}`)
  }

  const docs = []

  for (const row of data) {
    const day  = pickInt(row, 'day')
    const hour = pickInt(row, 'hour')

    // Must have valid day (1-6) and hour
    if (day === null || day < 1 || day > 6) continue
    if (hour === null || hour < 1) continue

    // Normalise F-Dept (fix casing inconsistencies)
    const facultyDept = normaliseDept(pick(row, 'facultyDept'))

    docs.push({
      source_file:  pick(row, 'department'),
      reg:          pick(row, 'regulation'),
      dataset,

      umatdayid:    day,
      umat_hourno:  hour,

      course_code:  pick(row, 'courseCode') || null,
      course_name:  pick(row, 'courseName') || null,
      year:         pickInt(row, 'year'),
      cocssiid:     pickInt(row, 'cocssiid'),
      coursedeliverycomponent: pickInt(row, 'deliveryComp'),
      offered_by_deptid: pickInt(row, 'offeredBy'),
      offered_to_deptid: pickInt(row, 'offeredTo'),

      main_sectionno:        pick(row, 'sectionNo') || null,
      associative_sectionno: pick(row, 'subSection') || null,
      faculty_seq:  pickInt(row, 'facultySeq'),
      sec_count:    pickInt(row, 'secCount'),

      emp_id:         pick(row, 'empId') || null,
      faculty_name:   pick(row, 'facultyName') || null,
      faculty_dept:   facultyDept || null,
      faculty_cohort: pick(row, 'facultyCohort') || null,

      room_no:          pick(row, 'roomNo') || null,
      umat_classroomno: pickInt(row, 'classroomNo'),
      room_con:         pick(row, 'roomCon') || null,
      r_type:           pick(row, 'roomType') || null,
      r_cap:            pick(row, 'roomCap') || null,
      r_diff:           pick(row, 'roomDiff') || null,

      src_d:                 pick(row, 'srcD') || null,
      umat_academic_year_id: pickInt(row, 'academicYear'),
      umat_semester_id:      pickInt(row, 'semester'),
      fctt:                  pick(row, 'fctt') || null,
      rctt:                  pick(row, 'rctt') || null,
    })
  }

  // Post-parse data quality checks
  if (docs.length > 0) {
    const nullEmpId = docs.filter(d => !d.emp_id).length
    const nullRoom  = docs.filter(d => !d.room_no).length
    const nullName  = docs.filter(d => !d.faculty_name).length
    const alias = f => COLUMNS[f].join('" / "')
    if (nullEmpId === docs.length)  warnings.push(`All ${docs.length} rows have an empty Employee ID \u2014 expected "${alias('empId')}"`)
    if (nullRoom  === docs.length)  warnings.push(`All ${docs.length} rows have an empty Room No \u2014 expected "${alias('roomNo')}"`)
    if (nullName  === docs.length)  warnings.push(`All ${docs.length} rows have an empty Faculty Name \u2014 expected "${alias('facultyName')}"`)
  }

  return { docs, warnings, headers, firstRow: data[0] || {} }
}

/**
 * parseGSheetRows(rows, dataset)
 * ──────────────────────────────
 * Parses rows from the Google Sheet (array-of-arrays format where first row = headers).
 * Column mapping for the KL University Google Sheet format which differs from BTT CSV:
 *   uni_id           → emp_id
 *   umat_classroomno → room_no  (classroom code like "C019")
 *   FACULTY COHORT   → faculty_cohort
 *   associative_sectionno → associative_sectionno (same)
 * Returns { docs, warnings, headers, firstRow } — same shape as parseBTTBuffer.
 */
export function parseGSheetRows(rows, dataset = 'live', columnOverrides = null) {
  const COLUMNS = resolveColumns(columnOverrides)
  const pick    = (row, field) => pickFrom(COLUMNS, row, field)
  const pickInt = (row, field) => pickIntFrom(COLUMNS, row, field)

  const warnings = []
  if (!rows.length) return { docs: [], warnings: ['Sheet is empty'], headers: [], firstRow: {} }

  const headers = rows[0].map(h => (h || '').trim())
  const firstRow = {}
  if (rows[1]) headers.forEach((h, i) => { firstRow[h] = rows[1][i] || '' })

  // Validate critical columns
  const missing = ['day', 'hour', 'empId', 'department', 'sectionNo']
    .filter(f => !COLUMNS[f].some(n => headers.includes(n)))
    .map(f => `${f} (expected one of: ${COLUMNS[f].join(' / ')})`)
  if (missing.length) warnings.push(`Missing required columns: ${missing.join('; ')}`)

  const idx = {}
  headers.forEach((h, i) => { idx[h] = i })

  const docs = []
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    if (!cells || cells.every(c => !c)) continue

    // Re-key the row so the shared COLUMNS aliases apply here too.
    const row = {}
    headers.forEach((h, i) => { row[h] = cells[i] })

    const day  = pickInt(row, 'day')
    const hour = pickInt(row, 'hour')
    if (day === null || day < 1 || day > 6) continue
    if (hour === null || hour < 1) continue

    const rawDept = pick(row, 'department')
    docs.push({
      source_file:  rawDept || null,
      reg:          pick(row, 'regulation') || null,
      dataset,
      umatdayid:    day,
      umat_hourno:  hour,
      course_code:  pick(row, 'courseCode') || null,
      course_name:  pick(row, 'courseName') || null,
      year:         pickInt(row, 'year'),
      cocssiid:     pickInt(row, 'cocssiid'),
      coursedeliverycomponent: pickInt(row, 'deliveryComp'),
      offered_by_deptid: pickInt(row, 'offeredBy'),
      offered_to_deptid: pickInt(row, 'offeredTo'),
      main_sectionno:        pick(row, 'sectionNo') || null,
      associative_sectionno: pick(row, 'subSection') || null,
      faculty_seq:  pickInt(row, 'facultySeq'),
      sec_count:    null,
      emp_id:       pick(row, 'empId') || null,
      faculty_name: pick(row, 'facultyName') || null,
      faculty_dept: normaliseDept(rawDept) || null,
      faculty_cohort: pick(row, 'facultyCohort') || null,
      room_no:          pick(row, 'roomNo') || pick(row, 'classroomNo') || null,
      umat_classroomno: pickInt(row, 'classroomNo'),
      room_con:         pick(row, 'roomCon') || null,
      r_type:           pick(row, 'roomType') || null,
      r_cap:            pick(row, 'roomCap') || null,
      r_diff:           pick(row, 'roomDiff') || null,
      src_d:            pick(row, 'srcD') || null,
      umat_academic_year_id: pickInt(row, 'academicYear'),
      umat_semester_id:      pickInt(row, 'semester'),
      fctt: pick(row, 'fctt') || null,
      rctt: pick(row, 'rctt') || null,
    })
  }

  if (docs.length > 0) {
    const nullEmpId = docs.filter(d => !d.emp_id).length
    if (nullEmpId === docs.length) warnings.push(`All ${docs.length} rows have empty Employee ID (uni_id column)`)
  }

  return { docs, warnings, headers, firstRow }
}

/**
 * parseRoomBuffer(buffer)
 * ────────────────────────
 * Parses KLEF-ERP-RD.csv
 * Columns: SLNO, Room No, BLOCK, CR/LAB, TOTAL, ALLOTED TO, DEPT ALLOTED TO
 */
export function parseRoomBuffer(buffer) {
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '')

  const { data } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  })

  return data
    .filter(r => r['Room No'] && r['Room No'].trim())
    .map(r => ({
      room_no:      r['Room No'].trim(),
      block:        (r['BLOCK'] || '').trim() || null,
      room_type:    (r['CR/LAB'] || '').trim() || null,
      capacity:     parseInt(r['TOTAL']) || null,
      alloted_to:   (r['ALLOTED TO'] || '').trim() || null,
      dept_alloted: (r['DEPT ALLOTED TO'] || '').trim() || null,
      slno:         parseInt(r['SLNO']) || null,
    }))
}

/**
 * Normalise inconsistent F-Dept values:
 * 'physics' → 'PHYSICS', 'CHEMISTRY ' → 'CHEMISTRY', etc.
 */
function normaliseDept(raw) {
  if (!raw || raw === '0' || raw === '#N/A') return null
  return raw.toUpperCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/EL&GE?$/, 'EL&G')  // EL&GE → EL&G
}
