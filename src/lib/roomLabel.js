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

/**
 * Sub-table within COE. B.Tech 1st year is not run by COE — those sections
 * belong to FED (Freshman Engineering Department), so they are pulled out of
 * the B.Tech table into their own.
 */
export function subGroupOf(normalizedProgram, year) {
  if (/^M\.Tech\b/i.test(normalizedProgram)) return 'M.Tech'
  if (/^B\.Tech\b/i.test(normalizedProgram)) return Number(year) === 1 ? 'FED' : 'B.Tech'
  return 'MHS'
}

/** The only three wings. */
export const WINGS = ['COE', 'MHS', 'FED']

/**
 * Wing per room.
 *
 * RoomMeta.alloted_to also carries CRT and COR, but neither is a wing:
 *   • CRT (28 rooms) is Campus Recruitment Training — a *usage*. Every one of
 *     those rooms is coeMhs=COE in RoomAllocation ("III CRT" / "IV ENGG").
 *   • COR (4 rooms: C517-C520, HLABs) is likewise coeMhs=COE in RoomAllocation.
 * Both therefore fold into COE.
 */
export const WING_BY_ALLOTMENT = {
  COE: 'COE', MHS: 'MHS', FED: 'FED', CRT: 'COE', COR: 'COE',
}

export const DAY_FIELDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export const DAY_NAMES  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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

/**
 * Some sources name a room descriptively — RoomAllocation has
 * "F102-CHEMISTRY LAB" and "F201-PHYSICS LAB" where RoomMeta has plain
 * "F102" and the room timetable has "F102-A" / "F102-MA". Left alone these
 * become a phantom second room that no timetable entry ever matches, so it
 * reads as permanently free. Reduce them to the room code.
 *
 * Only a tail of 3+ characters counts as a description; "-A" / "-MA" are
 * section suffixes and are left for resolveRoom to strip.
 */
const DESCRIPTIVE = /^([A-Z]{1,3}\s?\d{2,4}[A-Z]?\d?)\s*-\s*(.{3,})$/

export function canonicalRoom(raw) {
  // Internal spacing is significant elsewhere ("C421  B1"), so only trim/upper.
  const s = String(raw || '').trim().toUpperCase()
  const m = DESCRIPTIVE.exec(s)
  if (!m) return s
  if (/^(A|B|C|D|E|F|MA|AB|CD)$/.test(m[2].trim())) return s
  return m[1].replace(/\s+/g, '')
}

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

  // Last resort only, so this can never displace a match the rules above found:
  // "F001-ELECTRICAL M/C LAB" → "F001".
  const canon = canonicalRoom(s)
  if (canon !== s && knownRooms?.has(canon)) return canon

  return s
}
