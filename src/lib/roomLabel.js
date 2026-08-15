/**
 * roomLabel
 * ─────────
 * Parsing helpers for Room-Timetable (RoomwiseEntry) labels.
 *
 * A label looks like:  "Btech CSE-4-23IE4053A-P- SEC:77"
 *                       │         │ │         │      └─ section number
 *                       │         │ │         └─ delivery component L/T/P/S
 *                       │         │ └─ course code
 *                       │         └─ year (1-4)
 *                       └─ degree + branch  ("Btech CSE", "BBA", "B.Com.(Hons.)")
 *
 * Parsed RIGHT-to-left because the programme name itself contains hyphens and
 * spaces ("BBA - BA", "B. Com (Computer Applications) EA", "PHD-Management").
 */

const LABEL_RE =
  /^(.*?)\s*-\s*(\d+)\s*-\s*(\S+?)\s*-\s*([LTPS])\s*-\s*SEC\s*:\s*(\S+)$/i

export const COMPONENT_NAME = { L: 'Lecture', T: 'Tutorial', P: 'Practical', S: 'Skill' }

/** Collapse spelling variants so "Btech CSE" and "B.Tech CSE" are one row. */
export function normalizeProgram(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ')
  return s
    .replace(/^b\.?\s*tech\b[\s-]*/i, 'B.Tech ')
    .replace(/^m\.?\s*tech\b[\s-]*/i, 'M.Tech ')
    .trim()
}

/**
 * COE = B.Tech + M.Tech (College of Engineering).
 * MHS = everything else (BBA, BCA, B.Sc, MBA, PharmD, PHD-*, …).
 * Single place to change if PhD or Pharmacy should be split out later.
 */
export function categoryOf(normalizedProgram) {
  return /^(B\.Tech|M\.Tech)\b/i.test(normalizedProgram) ? 'COE' : 'MHS'
}

/** Returns null when the label does not match the expected shape. */
export function parseLabel(raw) {
  const m = LABEL_RE.exec(String(raw || '').trim())
  if (!m) return null
  const program = normalizeProgram(m[1])
  if (!program) return null
  return {
    program,
    category:    categoryOf(program),
    year:        parseInt(m[2], 10),
    course_code: m[3].toUpperCase(),
    component:   m[4].toUpperCase(),
    section:     m[5],
    label:       String(raw).trim(),
  }
}

/**
 * Room-Timetable room_no carries an associative-section suffix
 * ("C007-A", "C007-B", "500-A-MA"). Collapse to the physical room, preferring
 * a value that actually exists in the room master so we never over-merge.
 */
const SECTION_SUFFIX = /-(A|B|C|D|E|F|MA|AB|CD)$/i

export function resolveRoom(raw, knownRooms) {
  let s = String(raw || '').trim().toUpperCase()
  if (!s) return ''
  if (knownRooms?.has(s)) return s

  while (SECTION_SUFFIX.test(s)) {
    s = s.replace(SECTION_SUFFIX, '')
    if (knownRooms?.has(s)) return s
  }
  // "C117A" → "C117", but only when the stripped form is a real room.
  const trimmed = s.replace(/([A-Z0-9]{3,})[A-Z]$/, '$1')
  if (knownRooms?.has(trimmed)) return trimmed

  return s
}
