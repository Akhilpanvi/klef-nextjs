import RoomwiseEntry       from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot    from '@/lib/models/RoomwiseSnapshot'
import FacultywiseEntry    from '@/lib/models/FacultywiseEntry'
import FacultywiseSnapshot from '@/lib/models/FacultywiseSnapshot'
import { parseLabel, resolveRoom, normalizeProgram } from '@/lib/roomLabel'
import { buildRoomMaster } from '@/lib/roomMaster'

/**
 * erpData
 * ───────
 * One normalised view over the two ERP uploads — the Faculty-wise TT and the
 * Room-wise TT — shaped exactly like a TimetableEntry so the existing clash
 * engine and timetable grid work against it unchanged.
 *
 * Nothing here reads the BTT/GSheet timetable: the ERP tab is deliberately
 * built only from the two ERP files.
 *
 *   Faculty-wise TT  uni_id, name, room, Degree, Offering Level (= year),
 *                    course code, delivery component, section — everything
 *                    except the course title.
 *   Room-wise TT     programme, year, course, section and room from the label,
 *                    but never the faculty.
 *
 * The room-wise rows fill in classes the faculty-wise grid has no teacher for;
 * a class present in both is kept once, from the faculty-wise copy.
 */

export const COMPONENT_TO_NUM = { L: 1, T: 2, P: 3, S: 4 }

/** Both active snapshots, or nulls when an upload is missing. */
export async function loadErpSnapshots() {
  const [rwSnap, fwSnap] = await Promise.all([
    RoomwiseSnapshot.findOne().lean(),
    FacultywiseSnapshot.findOne().lean(),
  ])
  return { rwSnap, fwSnap }
}

/**
 * Normalised ERP entries for a slot filter (or the whole week when omitted).
 *
 * Returns TimetableEntry-shaped rows:
 *   umatdayid, umat_hourno, room_no, emp_id, faculty_name, course_code,
 *   main_sectionno, coursedeliverycomponent, src_d, year, program, source
 *
 * `src_d` is deliberately left null on every ERP row, which makes the clash
 * engine skip its Dual Faculty branch. That branch needs a role key to tell a
 * genuine double-assignment from legitimate co-teaching, and this source has
 * none: the room-wise grid carries the associative section in the room name
 * ("C007-MA", "C007-A", "C007-B" — main plus supporting faculty on one class)
 * while the faculty-wise grid records the plain room, with no suffix on any of
 * its 400 rooms. Several faculty on the same room + course + section are
 * therefore support staff for one class, not a clash, and there is no field
 * that separates main from supporting. Counting them flagged 1,259 pairs that
 * were all legitimate. They are reported as co-taught classes instead.
 *
 * The source also cannot express a Faculty Double-Booking: the grid has one
 * cell per faculty per slot, so that clash type is always empty here too.
 *
 * Room Overlap is unaffected — it fires on two different course codes sharing
 * a room in one slot, which stays meaningful.
 */
export async function loadErpEntries({ days, periods, snapshots, roomMaster } = {}) {
  const { rwSnap, fwSnap } = snapshots || await loadErpSnapshots()

  // Room names must be collapsed to the physical room before anything else.
  // The room-wise grid writes the associative section into the room ("C007-A",
  // "C007-MA") while the faculty-wise grid writes the plain room, so without
  // this the same class from the two files never matches and every section
  // variant looks like a separate room to the clash engine.
  const master = roomMaster || await buildRoomMaster(days?.length ? days : [1, 2, 3, 4, 5, 6])
  const known = master.knownRooms

  const slot = {}
  if (days?.length)    slot.day  = { $in: days }
  if (periods?.length) slot.hour = { $in: periods }

  const [rwRows, fwRows] = await Promise.all([
    rwSnap ? RoomwiseEntry.find({ dataset: rwSnap.snapshotId, ...slot },
      'room_no label day hour').lean() : [],
    fwSnap ? FacultywiseEntry.find({ dataset: fwSnap.snapshotId, ...slot },
      'uni_id faculty_name campus day hour room_no degree offering_level course_code component section').lean() : [],
  ])

  const entries = []
  const seen = new Set()
  // Identity of a class in a slot, ignoring who teaches it — this is what
  // stops the same class arriving twice from the two files.
  const classKey = (d, h, room, code, sec, comp) =>
    [d, h, room, (code || '').toUpperCase(), sec ?? '', (comp || '').toUpperCase()].join('|')

  let unparsed = 0

  for (const e of fwRows) {
    const room = resolveRoom(e.room_no, known)
    const comp = (e.component || '').toUpperCase()
    const key  = classKey(e.day, e.hour, room, e.course_code, e.section, comp)
    seen.add(key)
    entries.push({
      umatdayid: e.day, umat_hourno: e.hour,
      room_no: room || null,
      emp_id: e.uni_id || null,
      faculty_name: e.faculty_name || null,
      campus: e.campus || null,
      course_code: (e.course_code || '').toUpperCase() || null,
      course_name: null,
      main_sectionno: e.section != null ? String(e.section) : null,
      associative_sectionno: null,
      coursedeliverycomponent: COMPONENT_TO_NUM[comp] || null,
      src_d: null,   // no role field in this source — see the note above
      year: parseInt(e.offering_level, 10) || null,
      program: normalizeProgram(e.degree || '') || null,
      source: 'facultywise',
    })
  }

  for (const e of rwRows) {
    const p = parseLabel(e.label)
    if (!p) { unparsed++; continue }
    const room = resolveRoom(e.room_no, known)
    const key  = classKey(e.day, e.hour, room, p.course_code, p.section, p.component)
    if (seen.has(key)) continue          // already have it, with its teacher
    seen.add(key)
    entries.push({
      umatdayid: e.day, umat_hourno: e.hour,
      room_no: room || null,
      emp_id: null,
      faculty_name: null,
      campus: null,
      course_code: p.course_code || null,
      course_name: null,
      main_sectionno: p.section != null ? String(p.section) : null,
      associative_sectionno: null,
      coursedeliverycomponent: COMPONENT_TO_NUM[p.component] || null,
      src_d: null,                       // no teacher, so no role to compare
      year: p.year || null,
      program: p.program || null,
      source: 'roomwise',
    })
  }

  // Several faculty on one room+course+section+slot is co-teaching, not a
  // clash. Counted here so the clash page can report it as information.
  const coTaught = new Map()
  for (const e of entries) {
    if (!e.emp_id) continue
    const k = [e.umatdayid, e.umat_hourno, e.room_no, e.course_code, e.main_sectionno].join('|')
    const set = coTaught.get(k) || new Set()
    set.add(e.emp_id)
    coTaught.set(k, set)
  }
  const coTaughtClasses = [...coTaught.values()].filter(s => s.size > 1)

  return {
    entries,
    unparsed,
    roomMaster: master,
    coTaught: {
      classes: coTaughtClasses.length,
      maxFaculty: coTaughtClasses.reduce((m, s) => Math.max(m, s.size), 0),
      extraFaculty: coTaughtClasses.reduce((n, s) => n + s.size - 1, 0),
    },
    sources: {
      roomwise: rwSnap
        ? { label: rwSnap.label || rwSnap.filename, rows: rwRows.length } : null,
      facultywise: fwSnap
        ? { label: fwSnap.label || fwSnap.filename, rows: fwRows.length } : null,
    },
    counts: {
      facultywise: entries.filter(e => e.source === 'facultywise').length,
      roomwise:    entries.filter(e => e.source === 'roomwise').length,
    },
  }
}

/** FD profile fields for a set of Emp Nos, keyed by id. uni_id === User.eid. */
export function fdProfile(u) {
  if (!u) return null
  return {
    eid: u.eid || null,
    name: u.display_name || null,
    dept: u.dept || null,                                 // DPET
    designation: u.designation || null,
    designation_category: u.designation_category || null, // R / Ac / Ad
    assigned_responsibility: u.assigned_responsibility || null,
    cohort: u.cohort || null,
    cohort_name: u.cohort_name || null,
    phone: u.phone || null,
    email: u.email || null,
    load_as_per_designation: u.load_as_per_designation ?? null,
    pl: u.pl ?? null,
  }
}

export const FD_FIELDS =
  'eid display_name dept designation designation_category assigned_responsibility ' +
  'cohort cohort_name phone email load_as_per_designation pl'
