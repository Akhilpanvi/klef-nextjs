/**
 * facultyWorkload
 * ───────────────
 * Turn parsed Faculty-wise TT rows into a per-faculty timetable and workload.
 *
 * Pure and dependency-free so it runs in the browser against a file the user
 * picked — the Converter never saves anything.
 *
 * Not every scheduled hour counts as load. Re-registration and slow-learner
 * courses are taught but excluded from workload, and which ones they are
 * depends on the year: the same code can count for one cohort and not for
 * another. "Offering Level" in the faculty-wise grid IS that year, so an
 * exclusion is a course code plus, optionally, a year. Excluded hours are
 * still shown in the timetable — they are real classes — they just do not add
 * to the counted load.
 */

const norm = v => String(v ?? '').trim().toUpperCase()

/**
 * Parse the exclusion list. One rule per line, comma or whitespace separated:
 *
 *     23IE4053A          excluded in every year
 *     23IE4053A, 4       excluded only for Offering Level 4
 *     25CS2101 2         same, whitespace instead of a comma
 *     # a comment        ignored, as are blank lines
 *
 * Returns { rules, errors } so bad lines can be shown rather than dropped.
 */
export function parseExclusions(text) {
  const rules = []
  const errors = []
  const seen = new Set()

  String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.split('#')[0].trim()
    if (!line) return

    const parts = line.split(/[,\t;]+|\s+/).map(p => p.trim()).filter(Boolean)
    const code = norm(parts[0])
    if (!code) return
    if (!/^[A-Z0-9./-]{3,}$/.test(code)) {
      errors.push(`Line ${i + 1}: "${parts[0]}" does not look like a course code`)
      return
    }

    const years = []
    for (const p of parts.slice(1)) {
      const n = parseInt(p, 10)
      if (Number.isNaN(n) || n < 1 || n > 10) {
        errors.push(`Line ${i + 1}: "${p}" is not a year (Offering Level 1-10)`)
        continue
      }
      years.push(n)
    }

    for (const y of years.length ? years : [null]) {
      const key = `${code}|${y ?? '*'}`
      if (seen.has(key)) continue
      seen.add(key)
      rules.push({ code, year: y })
    }
  })

  return { rules, errors }
}

/**
 * Turn a sheet of exclusions into rule lines for the textarea.
 *
 * Accepts a file with headers naming the code and the year — "Course Code" /
 * "Code" / "Subject Code", and "Year" / "Offering Level" / "Level" — matched
 * loosely. If neither header is recognised the first two columns are used, so
 * a bare two-column list still works.
 *
 * Returns { text, count, note } rather than rules, so what was read lands in
 * the box where it can be checked and edited before it takes effect.
 */
export function exclusionsFromRows(rows) {
  if (!rows?.length) return { text: '', count: 0, note: 'That file has no rows.' }

  const headers = Object.keys(rows[0])
  const fold = h => String(h ?? '').toLowerCase().replace(/[^a-z]/g, '')
  const codeCol = headers.find(h => /coursecode|subjectcode|^code$/.test(fold(h)))
    || headers.find(h => fold(h).includes('course') || fold(h).includes('code'))
  const yearCol = headers.find(h => /offeringlevel|yearofstudy|^year$|^level$/.test(fold(h)))
    || headers.find(h => fold(h).includes('year') || fold(h).includes('level'))

  const useCode = codeCol ?? headers[0]
  const useYear = yearCol ?? headers[1]
  const note = codeCol
    ? null
    : `No "Course Code" column found — using "${useCode}"${useYear ? ` and "${useYear}"` : ''}.`

  const lines = []
  const seen = new Set()
  for (const row of rows) {
    const code = norm(row[useCode])
    if (!code || code === norm(useCode)) continue
    const rawYear = useYear ? String(row[useYear] ?? '').trim() : ''
    const year = parseInt(rawYear, 10)
    const line = Number.isNaN(year) ? code : `${code}, ${year}`
    if (seen.has(line)) continue
    seen.add(line)
    lines.push(line)
  }

  return { text: lines.join('\n'), count: lines.length, note }
}

/** Index the rules so matching is a lookup rather than a scan per row. */
function indexRules(rules) {
  const anyYear = new Set()
  const byYear = new Map()
  for (const r of rules || []) {
    if (r.year == null) anyYear.add(r.code)
    else {
      const set = byYear.get(r.code) || new Set()
      set.add(r.year)
      byYear.set(r.code, set)
    }
  }
  return { anyYear, byYear }
}

const isExcluded = (idx, code, year) => {
  const c = norm(code)
  if (!c) return false
  if (idx.anyYear.has(c)) return true
  const years = idx.byYear.get(c)
  return Boolean(years && year != null && years.has(year))
}

/**
 * computeWorkload(docs, roster, rules)
 *
 * `docs` and `roster` come from parseFacultywiseBuffer. The roster matters:
 * a lecturer with an empty week has no rows at all, so counting only what is
 * busy would hide exactly the people a workload review is looking for.
 */
export function computeWorkload(docs = [], roster = [], rules = []) {
  const idx = indexRules(rules)

  const byId = new Map()
  const ensure = (id, seed = {}) => {
    const key = String(id ?? '').trim()
    if (!key) return null
    let f = byId.get(key)
    if (!f) {
      f = {
        id: key, name: null, campus: null,
        total: 0, counted: 0, excluded: 0,
        courses: new Set(), countedCourses: new Set(),
        rooms: new Set(), days: new Set(), slots: [],
        excludedBy: new Map(),          // "CODE (Yr n)" -> hours
      }
      byId.set(key, f)
    }
    if (seed.name && !f.name) f.name = seed.name
    if (seed.campus && !f.campus) f.campus = seed.campus
    return f
  }

  for (const r of roster) ensure(r.uni_id, { name: r.faculty_name, campus: r.campus })

  let excludedHours = 0
  const excludedCourses = new Map()   // "CODE|year" -> hours

  for (const d of docs) {
    const f = ensure(d.uni_id || d.faculty_name, { name: d.faculty_name, campus: d.campus })
    if (!f) continue

    const year = parseInt(d.offering_level, 10) || null
    const code = norm(d.course_code)
    const skip = isExcluded(idx, code, year)

    f.total++
    if (code) f.courses.add(code)
    if (d.room_no) f.rooms.add(norm(d.room_no))
    if (d.day) f.days.add(d.day)

    if (skip) {
      f.excluded++
      excludedHours++
      const label = `${code}${year ? ` (Yr ${year})` : ''}`
      f.excludedBy.set(label, (f.excludedBy.get(label) || 0) + 1)
      excludedCourses.set(`${code}|${year ?? ''}`,
        (excludedCourses.get(`${code}|${year ?? ''}`) || 0) + 1)
    } else {
      f.counted++
      if (code) f.countedCourses.add(code)
    }

    f.slots.push({
      day: d.day, hour: d.hour, room: d.room_no || null,
      code: d.course_code || null, component: d.component || null,
      section: d.section || null, year, degree: d.degree || null,
      excluded: skip,
    })
  }

  const faculty = [...byId.values()]
    .map(f => ({
      ...f,
      courses: f.courses.size,
      countedCourses: f.countedCourses.size,
      rooms: f.rooms.size,
      days: f.days.size,
      slots: f.slots.sort((a, b) => a.day - b.day || a.hour - b.hour),
      excludedBy: [...f.excludedBy.entries()]
        .map(([label, hours]) => ({ label, hours }))
        .sort((a, b) => b.hours - a.hours),
    }))
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))

  const totalHours = faculty.reduce((n, f) => n + f.total, 0)
  const counted = faculty.reduce((n, f) => n + f.counted, 0)

  return {
    faculty,
    stats: {
      facultyCount: faculty.length,
      withClasses: faculty.filter(f => f.total > 0).length,
      idle: faculty.filter(f => f.total === 0).length,
      totalHours,
      countedHours: counted,
      excludedHours,
      affectedFaculty: faculty.filter(f => f.excluded > 0).length,
      rulesApplied: rules.length,
      maxCounted: faculty.reduce((m, f) => Math.max(m, f.counted), 0),
    },
    excludedCourses: [...excludedCourses.entries()]
      .map(([k, hours]) => {
        const [code, year] = k.split('|')
        return { code, year: year ? Number(year) : null, hours }
      })
      .sort((a, b) => b.hours - a.hours),
  }
}
