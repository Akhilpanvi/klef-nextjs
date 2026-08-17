import * as XLSX from 'xlsx'

/**
 * facultywiseParser
 * ─────────────────
 * Parses the Faculty-wise TT grid (CSV or XLSX).
 *
 * Layout: uni_id / facultyname / campusshortname, then one column per
 * day+period. The period columns appear either as a single header row
 * ("mon 1", "mon 2", ...) or as two rows — day names on one, period numbers
 * on the next — so both are handled.
 *
 * A busy cell holds a block of labelled fields, newline separated in the
 * source but sometimes flattened onto one line:
 *     Room No: S719B
 *     Degree: Mtech-CSE
 *     Offering Level: 2
 *     Course Code: 25IE6148
 *     Delivery Component: P
 *     Section:1
 * Free cells hold "-" (or are blank) and produce no entry.
 */

const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

// Field labels inside a cell. Order matters only for the boundary lookahead.
const CELL_FIELDS = {
  room_no:        'Room\\s*No',
  degree:         'Degree',
  offering_level: 'Offering\\s*Level',
  course_code:    'Course\\s*Code',
  component:      'Delivery\\s*Component',
  section:        'Section',
}
const ANY_FIELD = Object.values(CELL_FIELDS).join('|')

const norm = v => String(v ?? '').replace(/\s+/g, ' ').trim()
const isBlank = v => { const s = String(v ?? '').trim(); return !s || s === '-' || s === '--' }

/** Value of one labelled field, stopping at the next label or end of cell. */
function cellField(cell, pattern) {
  const re = new RegExp(
    `${pattern}\\s*:\\s*([\\s\\S]*?)(?=\\s*(?:${ANY_FIELD})\\s*:|$)`, 'i')
  const m = re.exec(cell)
  return m ? norm(m[1]) || null : null
}

/** Parse "mon 1" / "mon1" / "Monday-1" into { day, hour }. */
function parseSlotHeader(text) {
  const s = String(text ?? '').toLowerCase()
  const dayIdx = DAY_NAMES.findIndex(d => s.includes(d))
  if (dayIdx === -1) return null
  const m = s.match(/(\d{1,2})/)
  if (!m) return null
  const hour = parseInt(m[1], 10)
  if (!hour || hour < 1 || hour > 24) return null
  return { day: dayIdx + 1, hour }
}

const looksLikeId     = h => /uni[\s_-]*id|emp[\s_-]*id|employee/i.test(h)
const looksLikeName   = h => /faculty\s*name|facultyname|^name$/i.test(h)
const looksLikeCampus = h => /campus/i.test(h)

export function parseFacultywiseBuffer(buf, snapshotId) {
  const wb   = XLSX.read(buf, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false })

  const warnings = []
  if (!rows.length) return { docs: [], faculty: [], warnings: ['File is empty'], headers: [] }

  // ── Locate the header row ────────────────────────────────────────────────
  let h = rows.findIndex(r => r.some(c => looksLikeId(String(c))))
  if (h === -1) {
    h = 0
    warnings.push('No "uni_id" header found — assuming the first row is the header')
  }

  let headers = rows[h].map(norm)

  // A second header row of bare period numbers: merge it into the day names.
  const next = rows[h + 1] || []
  const numericCells = next.filter(c => /^\d{1,2}$/.test(String(c).trim())).length
  const idColsBlank  = headers.some(looksLikeId) &&
    next.slice(0, 3).every(c => isBlank(c) || /^\d{1,2}$/.test(String(c).trim()) === false)
  let dataStart = h + 1
  if (numericCells >= 4 && idColsBlank) {
    headers = headers.map((cell, i) => {
      const n = String(next[i] ?? '').trim()
      return /^\d{1,2}$/.test(n) ? `${cell} ${n}`.trim() : cell
    })
    dataStart = h + 2
  }

  // Day headers are often written once and left blank across the run.
  let lastDay = ''
  headers = headers.map(cell => {
    const found = DAY_NAMES.find(d => cell.toLowerCase().includes(d))
    if (found) { lastDay = found; return cell }
    if (lastDay && /^\d{1,2}$/.test(cell)) return `${lastDay} ${cell}`
    return cell
  })

  // ── Map the columns ─────────────────────────────────────────────────────
  const idCol     = headers.findIndex(looksLikeId)
  const nameCol   = headers.findIndex(looksLikeName)
  const campusCol = headers.findIndex(looksLikeCampus)
  if (idCol === -1) warnings.push('Could not find the uni_id column')
  if (nameCol === -1) warnings.push('Could not find the facultyname column')

  const slotCols = []
  headers.forEach((cell, i) => {
    if (i === idCol || i === nameCol || i === campusCol) return
    const slot = parseSlotHeader(cell)
    if (slot) slotCols.push({ index: i, ...slot })
  })
  if (!slotCols.length)
    warnings.push('No day/period columns recognised — expected headers like "mon 1" … "sat 11"')

  // ── Walk the rows ───────────────────────────────────────────────────────
  const docs = []
  const faculty = []
  const seen = new Set()

  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every(c => isBlank(c))) continue

    const uni_id = norm(idCol >= 0 ? row[idCol] : '')
    const name   = norm(nameCol >= 0 ? row[nameCol] : '')
    const campus = norm(campusCol >= 0 ? row[campusCol] : '')
    if (!uni_id && !name) continue

    const key = uni_id || name
    if (seen.has(key)) continue
    seen.add(key)

    let slotCount = 0
    for (const { index, day, hour } of slotCols) {
      const cellRaw = String(row[index] ?? '')
      if (isBlank(cellRaw)) continue

      const entry = {
        dataset: snapshotId,
        uni_id: uni_id || null,
        faculty_name: name || null,
        campus: campus || null,
        day, hour,
        raw: norm(cellRaw).slice(0, 500),
      }
      for (const [field, pattern] of Object.entries(CELL_FIELDS)) {
        entry[field] = cellField(cellRaw, pattern)
      }
      // A cell with text but no recognised label is still an occupied slot.
      docs.push(entry)
      slotCount++
    }

    faculty.push({ dataset: snapshotId, uni_id: uni_id || name, faculty_name: name || null, campus: campus || null, slotCount })
  }

  if (!docs.length && faculty.length)
    warnings.push(`Parsed ${faculty.length} faculty but no busy slots — check the day/period columns`)

  const unlabelled = docs.filter(d => !d.room_no && !d.course_code).length
  if (unlabelled)
    warnings.push(`${unlabelled} occupied cell(s) had no "Room No" or "Course Code" — stored as raw text`)

  return { docs, faculty, warnings, headers, slotColumns: slotCols.length }
}
