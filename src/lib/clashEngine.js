/**
 * Clash Detection Engine
 * ──────────────────────
 * Identical logic to the original app but runs server-side against
 * MongoDB data (passed in as an array already fetched).
 *
 * isAdditionalSection: matches "A","B","MA","1A","24B","3MA","12C" (true)
 * but NOT plain numbers or other strings.
 */

const DAY_SHORT  = { 1:'Mon', 2:'Tue', 3:'Wed', 4:'Thu', 5:'Fri', 6:'Sat' }
const DAY_FULL   = { 1:'Monday', 2:'Tuesday', 3:'Wednesday', 4:'Thursday', 5:'Friday', 6:'Saturday' }

function isAdditionalSection(sec) {
  if (!sec) return false
  return /^(\d+)?(MA|[ABCD])$/i.test(sec.toString().trim())
}

/**
 * detectClashes(entries, metaMap)
 *
 * @param {Array}  entries  – TimetableEntry documents (lean, umat_hourno 1-24)
 * @param {Object} metaMap  – { [room_no]: RoomMeta }
 * @returns {Array} clash objects
 */
export function detectClashes(entries, metaMap = {}) {
  const roomSlotMap    = new Map()   // "day|hour|room"  → rows[]
  const facultySlotMap = new Map()   // "day|hour|empid" → rows[]

  for (const row of entries) {
    const day  = row.umatdayid
    const hour = row.umat_hourno
    const room = row.room_no
    const emp  = row.emp_id

    if (!day || !hour) continue

    if (room) {
      const k = `${day}|${hour}|${room}`
      if (!roomSlotMap.has(k)) roomSlotMap.set(k, [])
      roomSlotMap.get(k).push(row)
    }
    if (emp) {
      const k = `${day}|${hour}|${emp}`
      if (!facultySlotMap.has(k)) facultySlotMap.set(k, [])
      facultySlotMap.get(k).push(row)
    }
  }

  const clashes = []

  // ── PASS 1: Room-based ───────────────────────────────────────────────────
  for (const [key, entries] of roomSlotMap) {
    if (entries.length < 2) continue
    const [day, hour, room] = key.split('|')
    const meta     = metaMap[room] || {}
    const roomType = meta.room_type || '-'

    const normal = entries.filter(e => !isAdditionalSection(e.main_sectionno))
    if (normal.length < 2) continue

    const byCourse = new Map()
    for (const e of normal) {
      const code = (e.course_code || '').trim()
      if (!byCourse.has(code)) byCourse.set(code, [])
      byCourse.get(code).push(e)
    }

    const courses = [...byCourse.keys()]

    if (courses.length === 1) {
      // Dual Faculty — skip for labs
      if (/lab/i.test(roomType)) continue

      const ces = byCourse.get(courses[0])

      // Group by SRC-D (role key).
      // Co-teaching with DIFFERENT SRC-D values (e.g. one "-MA-", one "-C-") is valid — no clash.
      // Only flag if two different faculty share the EXACT SAME SRC-D string.
      const byRole = new Map()
      for (const e of ces) {
        const roleKey = (e.src_d || e.main_sectionno || '').trim()
        if (!byRole.has(roleKey)) byRole.set(roleKey, [])
        byRole.get(roleKey).push(e)
      }

      let conflictRole = null
      for (const [, roleEntries] of byRole) {
        const uniqueEmps = [...new Set(roleEntries.map(e => (e.emp_id || '').trim()))]
        if (uniqueEmps.length >= 2) { conflictRole = roleEntries; break }
      }

      if (conflictRole) {
        const fac1 = conflictRole[0].faculty_name || '-'
        const fac2 = conflictRole.find(e => e.emp_id !== conflictRole[0].emp_id)?.faculty_name || '-'
        const roleLabel = conflictRole[0].src_d || conflictRole[0].main_sectionno || '-'
        const uniqueEmps = [...new Set(conflictRole.map(e => (e.emp_id || '').trim()))]
        clashes.push({
          type: 'Dual Faculty',
          severity: 'warn',
          day: +day, hour: +hour, room, roomType,
          courseCode1: courses[0], courseName1: conflictRole[0].course_name || '-',
          courseCode2: courses[0], courseName2: conflictRole[0].course_name || '-',
          section: conflictRole.map(e => e.main_sectionno || '-').join(', '),
          faculty1: fac1,
          faculty2: fac2,
          desc: `Subject "${courses[0]}" in ${room} (${roomType}) has ${uniqueEmps.length} faculty for the same role (${roleLabel}) on ${DAY_SHORT[+day]} P${hour}.`,
        })
      }
    } else {
      // Room Overlap
      clashes.push({
        type: 'Room Overlap',
        severity: 'severe',
        day: +day, hour: +hour, room, roomType,
        courseCode1: normal[0].course_code || '-', courseName1: normal[0].course_name || '-',
        courseCode2: normal[1].course_code || '-', courseName2: normal[1].course_name || '-',
        section: normal.map(e => e.main_sectionno || '-').join(', '),
        faculty1: normal[0].faculty_name || '-',
        faculty2: normal[1].faculty_name || '-',
        desc: `Room ${room} (${roomType}) has ${normal.length} different classes on ${DAY_SHORT[+day]} P${hour}: ${courses.join(', ')}.`,
      })
    }
  }

  // ── PASS 2: Faculty Double-Booked ────────────────────────────────────────
  for (const [key, entries] of facultySlotMap) {
    if (entries.length < 2) continue
    const [day, hour, emp] = key.split('|')

    const normal = entries.filter(e => !isAdditionalSection(e.main_sectionno))
    if (normal.length < 2) continue

    const sections = [...new Set(normal.map(e => (e.main_sectionno || '').trim()))]
    if (sections.length < 2) continue

    const courses   = [...new Set(normal.map(e => (e.course_code || '').trim()))]
    const firstRoom = (normal[0].room_no || '-').trim()
    const roomType  = (metaMap[firstRoom] || {}).room_type || '-'
    const subjDesc  = courses.length >= 2
      ? `two subjects (${courses.join(' & ')})`
      : `"${courses[0]}" in multiple sections`

    clashes.push({
      type: 'Faculty Double-Booked',
      severity: 'info',
      day: +day, hour: +hour, room: firstRoom, roomType,
      courseCode1: normal[0].course_code || '-', courseName1: normal[0].course_name || '-',
      courseCode2: normal[1].course_code || '-', courseName2: normal[1].course_name || '-',
      section: sections.join(' & '),
      faculty1: normal[0].faculty_name || '-',
      faculty2: normal[1].faculty_name || '-',
      desc: `${normal[0].faculty_name || emp} is double-booked for ${subjDesc} on ${DAY_SHORT[+day]} P${hour}.`,
    })
  }

  // Sort: severe → warn → info, then day → hour
  const ORDER = { severe: 0, warn: 1, info: 2 }
  clashes.sort((a, b) =>
    ORDER[a.severity] - ORDER[b.severity] || a.day - b.day || a.hour - b.hour
  )

  return clashes
}
