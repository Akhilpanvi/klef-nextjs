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
// Columns the parser reads \u2014 used for header validation
const EXPECTED_COLS = [
  'umatdayid', 'umat_hourno',
  'EMP ID', 'F-Name', 'F-Dept',
  'ROOM NO', 'C-Name', 'DEPT',
]

export function parseBTTBuffer(buffer, dataset = 'live') {
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '') // strip BOM

  const { data } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  })

  const warnings = []

  // Validate headers before processing rows
  const headers = data.length > 0 ? Object.keys(data[0]) : []
  const missingCols = EXPECTED_COLS.filter(c => !headers.includes(c))
  if (missingCols.length) {
    warnings.push(`Missing expected columns: ${missingCols.join(', ')}`)
    warnings.push(`Columns found in file: ${headers.join(', ')}`)
  }

  const docs = []

  for (const row of data) {
    const day = parseInt(row['umatdayid'])
    const hour = parseInt(row['umat_hourno'])

    // Must have valid day (1-6) and hour
    if (isNaN(day) || day < 1 || day > 6) continue
    if (isNaN(hour) || hour < 1) continue

    // Normalise F-Dept (fix casing inconsistencies)
    const rawDept = (row['F-Dept'] || '').trim()
    const facultyDept = normaliseDept(rawDept)

    docs.push({
      source_file:  (row['DEPT'] || '').trim(),
      reg:          (row['REG'] || '').trim(),
      dataset,

      umatdayid:    day,
      umat_hourno:  hour,

      course_code:  (row['Course code'] || '').trim() || null,
      course_name:  (row['C-Name'] || '').trim() || null,
      year:         parseInt(row['YEAR']) || null,
      cocssiid:     parseInt(row['cocssiid']) || null,
      coursedeliverycomponent: parseInt(row['coursedeliverycomponent']) || null,
      offered_by_deptid: parseInt(row['offerred_by_deptid']) || null,
      offered_to_deptid: parseInt(row['offered_to_deptid']) || null,

      main_sectionno:        (row['main_sectionno'] || '').toString().trim() || null,
      associative_sectionno: (row['associative_sectionno'] || '').toString().trim() || null,
      faculty_seq:  parseInt(row['faculty_seq']) || null,
      sec_count:    parseInt(row['SEC COUNT']) || null,

      emp_id:         (row['EMP ID'] || '').toString().trim() || null,
      faculty_name:   (row['F-Name'] || '').trim() || null,
      faculty_dept:   facultyDept || null,
      faculty_cohort: (row['F-Cohort'] || '').trim() || null,

      room_no:          (row['ROOM NO'] || '').trim() || null,
      umat_classroomno: parseInt(row['umat_classroomno']) || null,
      room_con:         (row['ROOM CON'] || '').trim() || null,
      r_type:           (row['R-TYPE'] || '').trim() || null,
      r_cap:            (row['R-CAP'] || '').trim() || null,
      r_diff:           (row['R-DIFF'] || '').trim() || null,

      src_d:                 (row['SRC-D'] || '').trim() || null,
      umat_academic_year_id: parseInt(row['umat_academic_year_id']) || null,
      umat_semester_id:      parseInt(row['umat_semester_id']) || null,
      fctt:                  (row['FCTT'] || '').trim() || null,
      rctt:                  (row['RCTT'] || '').trim() || null,
    })
  }

  // Post-parse data quality checks
  if (docs.length > 0) {
    const nullEmpId = docs.filter(d => !d.emp_id).length
    const nullRoom  = docs.filter(d => !d.room_no).length
    const nullName  = docs.filter(d => !d.faculty_name).length
    if (nullEmpId === docs.length)  warnings.push(`All ${docs.length} rows have empty EMP ID \u2014 "EMP ID" column may be named differently in this file`)
    if (nullRoom  === docs.length)  warnings.push(`All ${docs.length} rows have empty ROOM NO \u2014 "ROOM NO" column may be named differently`)
    if (nullName  === docs.length)  warnings.push(`All ${docs.length} rows have empty F-Name \u2014 "F-Name" column may be named differently`)
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
export function parseGSheetRows(rows, dataset = 'live') {
  const warnings = []
  if (!rows.length) return { docs: [], warnings: ['Sheet is empty'], headers: [], firstRow: {} }

  const headers = rows[0].map(h => (h || '').trim())
  const firstRow = {}
  if (rows[1]) headers.forEach((h, i) => { firstRow[h] = rows[1][i] || '' })

  // Validate critical columns
  const REQUIRED = ['umatdayid', 'umat_hourno', 'uni_id', 'DEPT', 'main_sectionno']
  const missing = REQUIRED.filter(c => !headers.includes(c))
  if (missing.length) warnings.push(`Missing expected columns: ${missing.join(', ')}`)

  const idx = {}
  headers.forEach((h, i) => { idx[h] = i })
  const col = (row, name) => (row[idx[name]] || '').toString().trim()

  const docs = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every(c => !c)) continue

    const day  = parseInt(col(row, 'umatdayid'))
    const hour = parseInt(col(row, 'umat_hourno'))
    if (isNaN(day) || day < 1 || day > 6) continue
    if (isNaN(hour) || hour < 1) continue

    const rawDept = col(row, 'DEPT')
    docs.push({
      source_file:  rawDept || null,
      reg:          col(row, 'REG') || null,
      dataset,
      umatdayid:    day,
      umat_hourno:  hour,
      course_code:  col(row, 'Course code') || null,
      course_name:  null,
      year:         null,
      cocssiid:     parseInt(col(row, 'cocssiid')) || null,
      coursedeliverycomponent: parseInt(col(row, 'coursedeliverycomponent')) || null,
      offered_by_deptid: parseInt(col(row, 'offerred_by_deptid')) || null,
      offered_to_deptid: parseInt(col(row, 'offered_to_deptid')) || null,
      main_sectionno:        col(row, 'main_sectionno') || null,
      associative_sectionno: col(row, 'associative_sectionno') || null,
      faculty_seq:  parseInt(col(row, 'faculty_seq')) || null,
      sec_count:    null,
      emp_id:       col(row, 'uni_id') || null,
      faculty_name: null,
      faculty_dept: normaliseDept(rawDept) || null,
      faculty_cohort: col(row, 'FACULTY COHORT') || col(row, 'COHORT') || null,
      room_no:          col(row, 'ROOM NO') || col(row, 'umat_classroomno') || null,
      umat_classroomno: parseInt(col(row, 'umat_classroomno')) || null,
      room_con:         col(row, 'CON') || col(row, 'ROOM CON') || null,
      r_type:           null,
      r_cap:            null,
      r_diff:           null,
      src_d:            null,
      umat_academic_year_id: parseInt(col(row, 'umat_academic_year_id')) || null,
      umat_semester_id:      parseInt(col(row, 'umat_semester_id')) || null,
      fctt: null,
      rctt: null,
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
