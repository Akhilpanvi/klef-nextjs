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
export function parseBTTBuffer(buffer, dataset = 'live') {
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '') // strip BOM

  const { data } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  })

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

  return docs
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
