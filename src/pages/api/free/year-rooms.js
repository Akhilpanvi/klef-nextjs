import { requireAuth }     from '@/lib/auth'
import { connectDB }       from '@/lib/mongodb'
import RoomwiseEntry       from '@/lib/models/RoomwiseEntry'
import RoomwiseSnapshot    from '@/lib/models/RoomwiseSnapshot'
import FacultywiseEntry    from '@/lib/models/FacultywiseEntry'
import FacultywiseFaculty  from '@/lib/models/FacultywiseFaculty'
import FacultywiseSnapshot from '@/lib/models/FacultywiseSnapshot'
import User                from '@/lib/models/User'
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
  // room -> Map("day-hour" -> { sel:Set(year), oth:Set(year) }).
  // Per slot, not per room: a room used by year 3 on Monday and year 2 at hour 8
  // is busy in two slots and free in the rest, and collapsing that to a single
  // label hides every hour it is actually available.
  const roomSlots  = new Map()
  const unmatched  = new Map()
  let unparsed = 0
  const totalSlots = dayNums.length * periodNums.length

  const noteRoom = (raw, sample, year, inScope, day, hour) => {
    if (!raw) return null
    const r = resolveRoom(raw, knownRooms)
    if (!r) return null
    if (!room.has(r)) {
      const u = unmatched.get(r) || { raws: new Set(), sample: sample || '' }
      u.raws.add(String(raw).trim())
      unmatched.set(r, u)
      return r
    }
    if (day && hour) {
      const grid = roomSlots.get(r) || new Map()
      const key  = `${day}-${hour}`
      const cell = grid.get(key) || { sel: new Set(), oth: new Set() }
      if (year != null) (inScope ? cell.sel : cell.oth).add(year)
      grid.set(key, cell)
      roomSlots.set(r, grid)
    }
    return r
  }

  const addClass = ({ program, year, course_code, component, section, roomRaw, sample, source, uni_id, faculty_name, campus, day, hour }) => {
    if (!program || !year) return
    yearsSeen.add(year)
    const inScope = yearSet.has(year)
    const resolved = noteRoom(roomRaw, sample, year, inScope, day, hour)
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
    if (!p) { unparsed++; noteRoom(e.room_no, e.label, null, false, e.day, e.hour); continue }
    addClass({
      program: p.program, year: p.year, course_code: p.course_code,
      component: p.component, section: p.section,
      roomRaw: e.room_no, sample: e.label, source: 'roomwise',
      day: e.day, hour: e.hour,
    })
  }

  // ── Faculty-wise TT ("Offering Level" is the year) ────────────────────────
  for (const e of fwEntries) {
    const program = normalizeProgram(e.degree || '')
    const year    = parseInt(e.offering_level, 10)
    if (!program || !year) {
      unparsed++
      noteRoom(e.room_no, e.raw, null, false, e.day, e.hour)
      continue
    }
    addClass({
      program, year, course_code: e.course_code, component: e.component,
      section: e.section, roomRaw: e.room_no, sample: e.raw, source: 'facultywise',
      uni_id: e.uni_id, faculty_name: e.faculty_name, campus: e.campus,
      day: e.day, hour: e.hour,
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

  // ── Rooms, per slot ──────────────────────────────────────────────────────
  // Every room reports how many of the selected slots it is busy in, which
  // years those are, and the busy slots themselves — so a room that is taken
  // on Monday and free at hour 8 reads as exactly that.
  const roomList = []
  for (const info of room.values()) {
    if (!WINGS.includes(info.wing)) continue
    const grid = roomSlots.get(info.room)
    const selYears = new Set(), othYears = new Set()
    const slots = []
    if (grid) {
      for (const [key, cell] of grid) {
        const [d, h] = key.split('-').map(Number)
        for (const y of cell.sel) selYears.add(y)
        for (const y of cell.oth) othYears.add(y)
        slots.push({ d, h, sel: [...cell.sel].sort((a, b) => a - b), oth: [...cell.oth].sort((a, b) => a - b) })
      }
      slots.sort((a, b) => a.d - b.d || a.h - b.h)
    }
    const busySlots = slots.length
    const freeSlots = Math.max(0, totalSlots - busySlots)

    roomList.push({
      room: info.room, capacity: info.capacity ?? null, type: info.type || null,
      block: info.block || null, floor: info.floor ?? null,
      wing: info.wing, allotment: info.allotment || info.wing,
      usage: info.usage || {},
      yearsSelected: [...selYears].sort((a, b) => a - b),
      yearsOther:    [...othYears].sort((a, b) => a - b),
      busySlots, freeSlots, totalSlots,
      // Who has it: touched by a selected year, only by others, or nobody.
      status: selYears.size ? 'selected' : othYears.size ? 'other' : 'free',
      // Whether the selected years have it to themselves. A room used only by
      // the selected years can be reassigned outright; one shared with another
      // year cannot, so this is the split that decides what is actionable.
      exclusivity: selYears.size
        ? (othYears.size ? 'shared' : 'exclusive')
        : (othYears.size ? 'othersOnly' : 'unused'),
      // How available it is across the selection.
      availability: busySlots === 0 ? 'fullyFree'
        : busySlots >= totalSlots ? 'fullyBusy' : 'partlyFree',
      slots,
    })
  }
  roomList.sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }))

  const seats = rows => rows.reduce((s, r) => s + (r.capacity || 0), 0)
  const count = fn => roomList.filter(fn).length

  const roomStats = WINGS.map(w => {
    const inWing = roomList.filter(r => r.wing === w)
    return {
      wing: w,
      selected:   inWing.filter(r => r.status === 'selected').length,
      other:      inWing.filter(r => r.status === 'other').length,
      free:       inWing.filter(r => r.status === 'free').length,
      exclusive:  inWing.filter(r => r.exclusivity === 'exclusive').length,
      shared:     inWing.filter(r => r.exclusivity === 'shared').length,
      fullyFree:  inWing.filter(r => r.availability === 'fullyFree').length,
      partlyFree: inWing.filter(r => r.availability === 'partlyFree').length,
      fullyBusy:  inWing.filter(r => r.availability === 'fullyBusy').length,
      freeSlots:  inWing.reduce((s, r) => s + r.freeSlots, 0),
      total:      inWing.length,
      freeSeats:  seats(inWing.filter(r => r.availability === 'fullyFree')),
    }
  })

  const faculty = [...facultyMap.entries()]
    .map(([id, f]) => {
      const key  = String(id).trim()
      const fd   = fdById.get(key)
      const week = weekById.get(key)
      const weekLoad = week ? week.slots : (rosterById.get(key)?.slotCount ?? null)
      const pl = fd?.pl ?? null
      return {
        ...f,
        slotCount: f.classes.length,
        campus: f.campus || rosterById.get(key)?.campus || null,
        // FD (faculty details) upload
        fd: fd ? {
          name: fd.display_name || null,
          dept: fd.dept || null,                                  // DPET
          designation: fd.designation || null,
          category: fd.designation_category || null,              // R / Ac / Ad
          responsibility: fd.assigned_responsibility || null,     // HOD, Dy.HOD, ...
          cohort: fd.cohort || null,
          cohort_name: fd.cohort_name || null,
          phone: fd.phone || null,
          email: fd.email || null,
          designationLoad: fd.load_as_per_designation ?? null,
          permissibleLoad: pl,
        } : null,
        // Actual load, measured from the faculty-wise timetable
        workload: {
          weekLoad,
          weekCourses: week ? week.courses.size : null,
          weekRooms:   week ? week.rooms.size : null,
          weekDays:    week ? week.days.size : null,
          vsPermissible: weekLoad != null && pl != null ? weekLoad - pl : null,
          utilisationPct: weekLoad != null && pl ? Math.round((weekLoad / pl) * 100) : null,
        },
      }
    })
    .sort((a, b) => String(a.faculty_name || a.uni_id).localeCompare(String(b.faculty_name || b.uni_id)))

  const fdMatched = faculty.filter(f => f.fd).length
  const overloaded = faculty.filter(f => (f.workload.vsPermissible ?? 0) > 0).length

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
      fdMatched,
      fdMissing: faculty.length - fdMatched,
      overloaded,
    },
    rooms: {
      byWing: roomStats,
      list: roomList,
      masterTotal: knownRooms.size,
      uncategorisedOccupied: unmatched.size,
      excluded: buildExcludedReport(excluded, unmatched),
    },
    totals: {
      classes:  classes.size,
      sections: tables.reduce((s, t) => s + t.sections, 0),
      slotsPerRoom:  totalSlots,
      selectedRooms: count(r => r.status === 'selected'),
      otherRooms:    count(r => r.status === 'other'),
      exclusiveRooms: count(r => r.exclusivity === 'exclusive'),
      sharedRooms:    count(r => r.exclusivity === 'shared'),
      exclusiveSeats: seats(roomList.filter(r => r.exclusivity === 'exclusive')),
      freeRooms:     count(r => r.status === 'free'),
      fullyFree:     count(r => r.availability === 'fullyFree'),
      partlyFree:    count(r => r.availability === 'partlyFree'),
      fullyBusy:     count(r => r.availability === 'fullyBusy'),
      freeSeats:     seats(roomList.filter(r => r.availability === 'fullyFree')),
      freeSlotTotal: roomList.reduce((s, r) => s + r.freeSlots, 0),
    },
    unparsed,
  })
}
