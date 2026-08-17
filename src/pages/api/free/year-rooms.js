import { requireAuth }     from '@/lib/auth'
import { connectDB }       from '@/lib/mongodb'
import RoomwiseEntry       from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot    from '@/lib/models/RoomwiseSnapshot'
import FacultywiseEntry    from '@/lib/models/FacultywiseEntry'
import FacultywiseSnapshot from '@/lib/models/FacultywiseSnapshot'
import { parseLabel, resolveRoom, normalizeProgram, categoryOf, degreeGroupOf, WINGS }
  from '@/lib/roomLabel'
import { buildRoomMaster, buildExcludedReport } from '@/lib/roomMaster'

/**
 * Year-wise rooms, sections and faculty for a slot.
 *
 * GET /api/free/year-rooms?years=1,2&days=1,2&periods=3,4
 *
 * Reads BOTH timetables and merges them:
 *   • Room-wise TT — label "Btech CSE-4-23IE4053A-P- SEC:77" gives programme,
 *     year, course and section, but never the faculty.
 *   • Faculty-wise TT — each busy cell gives Room No / Degree /
 *     Offering Level / Course Code / Delivery Component / Section, and the row
 *     gives uni_id and name. "Offering Level" IS the year.
 *
 * A class present in both is counted once; the faculty-wise copy is what
 * supplies the teacher, so merging is what makes "who is in this slot"
 * answerable at all.
 *
 * Year 1 stays inside its own degree group here (no FED split).
 */
const parseList = (raw, max) =>
  [...new Set(String(raw ?? '').split(',').map(Number).filter(n => n >= 1 && n <= max))]
    .sort((a, b) => a - b)

export default async function handler(req, res) {
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed' })

  const user = await requireAuth(req, res)
  if (!user) return

  const dayNums    = parseList(req.query.days ?? req.query.day, 7)
  const periodNums = parseList(req.query.periods, 24)
  const yearNums   = parseList(req.query.years ?? req.query.year, 10)

  if (!dayNums.length || !periodNums.length)
    return res.status(400).json({ success: false, message: 'days and periods required' })
  if (!yearNums.length)
    return res.status(400).json({ success: false, message: 'years required' })

  await connectDB()

  const [rwSnap, fwSnap] = await Promise.all([
    RoomwiseSnapshot.findOne().lean(),
    FacultywiseSnapshot.findOne().lean(),
  ])
  if (!rwSnap && !fwSnap)
    return res.json({
      success: true, noData: true,
      message: 'Neither the Room-wise nor the Faculty-wise timetable has been uploaded.',
    })

  const slot = { day: { $in: dayNums }, hour: { $in: periodNums } }
  const [rwEntries, fwEntries] = await Promise.all([
    rwSnap ? RoomwiseEntry.find({ dataset: rwSnap.snapshotId, ...slot },
      'room_no label day hour').lean() : [],
    fwSnap ? FacultywiseEntry.find({ dataset: fwSnap.snapshotId, ...slot }).lean() : [],
  ])

  const { room, excluded, knownRooms } = await buildRoomMaster(dayNums)

  const yearSet    = new Set(yearNums)
  const yearsSeen  = new Set()
  const classes    = new Map()   // dedupe key -> merged class record
  const facultyMap = new Map()   // uni_id -> { name, campus, classes:[] }
  const roomUse    = new Map()   // resolved room -> { selected:Set(year), other:Set(year) }
  const unmatched  = new Map()
  let unparsed = 0

  const noteRoom = (raw, sample, year, inScope) => {
    if (!raw) return null
    const r = resolveRoom(raw, knownRooms)
    if (!r) return null
    if (!room.has(r)) {
      const u = unmatched.get(r) || { raws: new Set(), sample: sample || '' }
      u.raws.add(String(raw).trim())
      unmatched.set(r, u)
      return r
    }
    const use = roomUse.get(r) || { selected: new Set(), other: new Set() }
    ;(inScope ? use.selected : use.other).add(year)
    roomUse.set(r, use)
    return r
  }

  const addClass = ({ program, year, course_code, component, section, roomRaw, sample, source, uni_id, faculty_name, campus }) => {
    if (!program || !year) return
    yearsSeen.add(year)
    const inScope = yearSet.has(year)
    const resolved = noteRoom(roomRaw, sample, year, inScope)
    if (!inScope) return

    const wing  = categoryOf(program)
    const group = degreeGroupOf(program)
    const key = [program, year, course_code || '', component || '', section || ''].join('|')
    const rec = classes.get(key) || {
      wing, group, program, year,
      course_code: course_code || null, component: component || null, section: section || null,
      rooms: new Set(), faculty: new Map(), sources: new Set(),
    }
    if (resolved) rec.rooms.add(resolved)
    rec.sources.add(source)
    if (uni_id || faculty_name) {
      rec.faculty.set(uni_id || faculty_name, { uni_id: uni_id || null, faculty_name: faculty_name || null })
    }
    classes.set(key, rec)

    if (uni_id || faculty_name) {
      const fid = uni_id || faculty_name
      const f = facultyMap.get(fid) || {
        uni_id: uni_id || null, faculty_name: faculty_name || null,
        campus: campus || null, classes: [],
      }
      f.classes.push({
        program, year, course_code: course_code || null, component: component || null,
        section: section || null, room: resolved || (roomRaw ? String(roomRaw).trim() : null),
      })
      facultyMap.set(fid, f)
    }
  }

  // ── Room-wise TT ──────────────────────────────────────────────────────────
  for (const e of rwEntries) {
    const p = parseLabel(e.label)
    if (!p) { unparsed++; noteRoom(e.room_no, e.label, null, false); continue }
    addClass({
      program: p.program, year: p.year, course_code: p.course_code,
      component: p.component, section: p.section,
      roomRaw: e.room_no, sample: e.label, source: 'roomwise',
    })
  }

  // ── Faculty-wise TT ("Offering Level" is the year) ────────────────────────
  for (const e of fwEntries) {
    const program = normalizeProgram(e.degree || '')
    const year    = parseInt(e.offering_level, 10)
    if (!program || !year) {
      unparsed++
      noteRoom(e.room_no, e.raw, null, false)
      continue
    }
    addClass({
      program, year, course_code: e.course_code, component: e.component,
      section: e.section, roomRaw: e.room_no, sample: e.raw, source: 'facultywise',
      uni_id: e.uni_id, faculty_name: e.faculty_name, campus: e.campus,
    })
  }

  // ── Sections pivoted by programme x year, per wing and degree group ───────
  const sections = {}
  for (const rec of classes.values()) {
    const key = `${rec.wing}|${rec.group}|${rec.program}|${rec.year}`
    ;(sections[key] ||= new Set()).add(rec.section ?? '—')
  }
  const rowsByKey = {}
  for (const [key, set] of Object.entries(sections)) {
    const [wing, group, program, year] = key.split('|')
    const row = (rowsByKey[`${wing}|${group}|${program}`] ||=
      { wing, group, program, years: {}, total: 0 })
    row.years[year] = set.size
    row.total += set.size
  }
  const GROUPS = [
    { wing: 'COE', group: 'B.Tech', title: 'COE — B.Tech' },
    { wing: 'COE', group: 'M.Tech', title: 'COE — M.Tech' },
    { wing: 'MHS', group: 'MHS',    title: 'MHS — BBA / BCA / B.Sc and others' },
  ]
  const tables = GROUPS.map(g => {
    const rows = Object.values(rowsByKey)
      .filter(r => r.wing === g.wing && r.group === g.group)
      .sort((a, b) => b.total - a.total || a.program.localeCompare(b.program))
    return { ...g, rows, programmes: rows.length, sections: rows.reduce((s, r) => s + r.total, 0) }
  })

  // ── Classes behind each cell ─────────────────────────────────────────────
  const cellClasses = {}
  for (const rec of classes.values()) {
    const key = `${rec.wing}|${rec.group}|${rec.program}|${rec.year}`
    ;(cellClasses[key] ||= []).push({
      course_code: rec.course_code, component: rec.component, section: rec.section,
      rooms: [...rec.rooms].sort(),
      faculty: [...rec.faculty.values()],
      sources: [...rec.sources].sort(),
    })
  }
  for (const list of Object.values(cellClasses)) {
    list.sort((a, b) => String(a.course_code).localeCompare(String(b.course_code)) ||
      String(a.section).localeCompare(String(b.section), undefined, { numeric: true }))
  }

  // ── Rooms: used by the selected years, by others, or free ────────────────
  const detail = Object.fromEntries(WINGS.map(w => [w, { selected: [], other: [], free: [] }]))
  for (const info of room.values()) {
    const bucket = detail[info.wing]
    if (!bucket) continue
    const use = roomUse.get(info.room)
    const row = {
      room: info.room, capacity: info.capacity ?? null, type: info.type || null,
      block: info.block || null, floor: info.floor ?? null,
      wing: info.wing, allotment: info.allotment || info.wing,
      usage: info.usage || {},
      yearsSelected: use ? [...use.selected].sort((a, b) => a - b) : [],
      yearsOther:    use ? [...use.other].sort((a, b) => a - b) : [],
    }
    if (use?.selected.size)    bucket.selected.push(row)
    else if (use?.other.size)  bucket.other.push(row)
    else                       bucket.free.push(row)
  }
  const byRoomNo = (a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })
  for (const w of WINGS) for (const k of ['selected', 'other', 'free']) detail[w][k].sort(byRoomNo)

  const seats = rows => rows.reduce((s, r) => s + (r.capacity || 0), 0)
  const roomStats = WINGS.map(w => ({
    wing: w,
    selected: detail[w].selected.length,
    other:    detail[w].other.length,
    free:     detail[w].free.length,
    total:    detail[w].selected.length + detail[w].other.length + detail[w].free.length,
    freeSeats: seats(detail[w].free),
  }))

  const faculty = [...facultyMap.values()]
    .map(f => ({ ...f, slotCount: f.classes.length }))
    .sort((a, b) => String(a.faculty_name || a.uni_id).localeCompare(String(b.faculty_name || b.uni_id)))

  res.json({
    success: true,
    years: yearNums,
    days: dayNums,
    periods: periodNums,
    yearsAvailable: [...yearsSeen].filter(Boolean).sort((a, b) => a - b),
    sources: {
      roomwise: rwSnap
        ? { label: rwSnap.label || rwSnap.filename, entries: rwEntries.length }
        : null,
      facultywise: fwSnap
        ? { label: fwSnap.label || fwSnap.filename, entries: fwEntries.length }
        : null,
    },
    tables,
    cellClasses,
    faculty,
    facultyTotals: {
      count: faculty.length,
      classes: faculty.reduce((s, f) => s + f.slotCount, 0),
      fromFacultywise: Boolean(fwSnap),
    },
    rooms: {
      byWing: roomStats,
      detail,
      masterTotal: knownRooms.size,
      uncategorisedOccupied: unmatched.size,
      excluded: buildExcludedReport(excluded, unmatched),
    },
    totals: {
      classes:  classes.size,
      sections: tables.reduce((s, t) => s + t.sections, 0),
      selectedRooms: WINGS.reduce((s, w) => s + detail[w].selected.length, 0),
      otherRooms:    WINGS.reduce((s, w) => s + detail[w].other.length, 0),
      freeRooms:     WINGS.reduce((s, w) => s + detail[w].free.length, 0),
      freeSeats:     WINGS.reduce((s, w) => s + seats(detail[w].free), 0),
    },
    unparsed,
  })
}
