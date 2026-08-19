'use client'
import { useState, useMemo, useRef } from 'react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { parseFacultywiseBuffer } from '@/lib/facultywiseParser'
import { parseExclusions, computeWorkload, exclusionsFromRows } from '@/lib/facultyWorkload'

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const COMP_LABEL = { L: 'Lecture', T: 'Tutorial', P: 'Practical', S: 'Skill' }

const lSt  = { fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em', margin: '0 0 8px' }
const thSt = { padding: '7px 9px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', borderBottom: '2px solid var(--border)', background: 'var(--surface-2)', whiteSpace: 'nowrap', textAlign: 'left' }
const tdSt = { padding: '6px 9px', fontSize: 12, borderBottom: '1px solid var(--border)' }

function Stat({ label, value, sub, color }) {
  return (
    <div className="card" style={{ padding: 14, minWidth: 140, flex: '1 1 140px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: color || 'var(--text-3)', letterSpacing: '.04em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

/** One faculty's week. Excluded hours are shown but struck through. */
function WeekGrid({ faculty, maxHour }) {
  const hours = Array.from({ length: maxHour }, (_, i) => i + 1)
  const byKey = new Map()
  for (const s of faculty.slots) {
    const k = `${s.day}-${s.hour}`
    const list = byKey.get(k) || []
    list.push(s)
    byKey.set(k, list)
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ ...thSt, padding: '4px 6px' }}>Day</th>
            {hours.map(h => <th key={h} style={{ ...thSt, padding: '4px 6px', textAlign: 'center', minWidth: 96 }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6].map(d => (
            <tr key={d}>
              <td style={{ ...tdSt, padding: '4px 6px', fontWeight: 700 }}>{DAY_SHORT[d - 1]}</td>
              {hours.map(h => {
                const list = byKey.get(`${d}-${h}`) || []
                if (!list.length) return <td key={h} style={{ ...tdSt, padding: '4px 6px', color: 'var(--text-3)', textAlign: 'center' }}>·</td>
                return (
                  <td key={h} style={{
                    ...tdSt, padding: '4px 6px', verticalAlign: 'top',
                    background: list.every(s => s.excluded) ? 'rgba(148,163,184,.18)' : 'rgba(16,185,129,.10)',
                  }}>
                    {list.map((s, i) => (
                      <div key={i} style={{
                        textDecoration: s.excluded ? 'line-through' : 'none',
                        color: s.excluded ? 'var(--text-3)' : 'var(--text)',
                      }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{s.code || '?'}</span>
                        {s.component ? ` ${s.component}` : ''}{s.year ? ` Y${s.year}` : ''}
                        {s.section ? ` S:${s.section}` : ''}
                        <div style={{ color: 'var(--text-3)' }}>{s.room || ''}</div>
                      </div>
                    ))}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
        Struck-through, grey cells are excluded from workload but still taught.
      </div>
    </div>
  )
}

export default function FacultyWorkload() {
  const fileRef = useRef(null)
  const [parsed, setParsed]   = useState(null)   // { docs, faculty, warnings, slotColumns }
  const [fileName, setFile]   = useState('')
  const [busy, setBusy]       = useState(false)
  const [rulesText, setRules] = useState('')
  const [search, setSearch]   = useState('')
  const [sort, setSort]       = useState('LOAD')
  const [openId, setOpenId]   = useState(null)
  const [showExcludedOnly, setExcludedOnly] = useState(false)
  const [ruleFiles, setRuleFiles] = useState([])   // [{ name, count }]
  const ruleFileRef = useRef(null)

  /**
   * Load one or more exclusion lists — COE and MHS are kept as separate files,
   * so several can be picked at once and each adds to the same list.
   *
   * The lines land in the text box rather than being applied straight off, so
   * they can be checked and edited first. Duplicates across files fold away,
   * which matters when a course appears on both lists.
   */
  const loadRuleFiles = async (fileList) => {
    const files = [...(fileList || [])]
    if (!files.length) return

    const loaded = []
    const failed = []
    let notes = []

    for (const file of files) {
      try {
        const buf = await file.arrayBuffer()
        const wb  = XLSX.read(new Uint8Array(buf), { type: 'array' })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        if (!ws) throw new Error('no readable sheet')
        const out = exclusionsFromRows(XLSX.utils.sheet_to_json(ws, { defval: '' }))
        if (!out.count) throw new Error('no course codes found')
        loaded.push({ name: file.name, count: out.count, text: out.text })
        if (out.note) notes.push(`${file.name}: ${out.note}`)
      } catch (err) {
        failed.push(`${file.name} (${err?.message || 'unreadable'})`)
      }
    }

    if (loaded.length) {
      setRules(prev => {
        const seen = new Set()
        const keep = []
        for (const line of [prev, ...loaded.map(l => l.text)].join('\n').split(/\r?\n/)) {
          const t = line.trim()
          if (!t) continue
          const key = t.toUpperCase().replace(/\s+/g, ' ')
          if (seen.has(key)) continue
          seen.add(key)
          keep.push(t)
        }
        return keep.join('\n')
      })
      setRuleFiles(prev => {
        const names = new Set(loaded.map(l => l.name))
        return [...prev.filter(f => !names.has(f.name)),
                ...loaded.map(l => ({ name: l.name, count: l.count }))]
      })
      const total = loaded.reduce((n, l) => n + l.count, 0)
      toast.success(`${total} course(s) from ${loaded.length} file(s)`)
    }
    notes.forEach(n => toast(n, { icon: '\u2139\ufe0f' }))
    if (failed.length) toast.error(`Could not read: ${failed.join(', ')}`)
    if (ruleFileRef.current) ruleFileRef.current.value = ''
  }

  const convertFile = async (file) => {
    if (!file) return
    setBusy(true); setParsed(null); setOpenId(null); setFile(file.name)
    try {
      const buf = await file.arrayBuffer()
      // Uint8Array, not Buffer: Buffer is a Node global and is not guaranteed
      // in the browser. SheetJS reads either.
      const out = parseFacultywiseBuffer(new Uint8Array(buf), 'converter')
      if (!out.faculty.length) throw new Error('No faculty rows found in that file.')
      setParsed(out)
      out.warnings?.forEach(w => toast(w, { icon: '⚠️' }))
      toast.success(`${out.faculty.length} faculty · ${out.docs.length} class hours`)
    } catch (err) {
      console.error('Faculty-wise conversion failed:', err)
      toast.error(err?.message || 'Could not read that file')
    } finally { setBusy(false) }
  }

  const { rules, errors } = useMemo(() => parseExclusions(rulesText), [rulesText])

  const result = useMemo(() => {
    if (!parsed) return null
    return computeWorkload(parsed.docs, parsed.faculty, rules)
  }, [parsed, rules])

  const maxHour = useMemo(() => {
    if (!parsed?.docs?.length) return 11
    return Math.max(11, ...parsed.docs.map(d => d.hour || 0))
  }, [parsed])

  const rows = useMemo(() => {
    if (!result) return []
    const q = search.trim().toLowerCase()
    const list = result.faculty
      .filter(f => !showExcludedOnly || f.excluded > 0)
      .filter(f => !q || String(f.id).includes(q) || (f.name || '').toLowerCase().includes(q))
    const by = {
      LOAD: (a, b) => b.counted - a.counted || String(a.name || '').localeCompare(String(b.name || '')),
      EXCL: (a, b) => b.excluded - a.excluded,
      NAME: (a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)),
      ID:   (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }),
    }
    return [...list].sort(by[sort] || by.LOAD)
  }, [result, search, sort, showExcludedOnly])

  const download = () => {
    if (!result) return toast.error('Convert a file first')
    try {
      const wb = XLSX.utils.book_new()
      const add = (data, name) =>
        XLSX.utils.book_append_sheet(wb,
          XLSX.utils.json_to_sheet(data.length ? data : [{ Note: 'Nothing to report' }]),
          name.slice(0, 31))

      // ── Sheet 1: the source file, with workload columns beside the names ──
      // The grid is written back cell for cell so the file keeps the shape it
      // arrived in and can go straight back into whatever consumes it.
      const g = parsed.grid
      if (g?.rows?.length && g.slotCols?.length) {
        const byId = new Map(result.faculty.map(f => [String(f.id), f]))
        const idOf = row => {
          const id = String(row[g.idCol] ?? '').replace(/\s+/g, ' ').trim()
          const nm = String(row[g.nameCol] ?? '').replace(/\s+/g, ' ').trim()
          return id || nm
        }
        // Identity columns first, then the load, then every original column
        // that is not an identity column — which keeps the day/period grid
        // and anything else the file carried.
        const idCols = [g.idCol, g.nameCol, g.campusCol].filter(i => i >= 0)
        const restCols = g.headers.map((_, i) => i).filter(i => !idCols.includes(i))

        const header = [
          ...idCols.map(i => g.headers[i] || ''),
          'Total Hours', 'Workload (counted)', 'Excluded Hours', 'Excluded From',
          ...restCols.map(i => g.headers[i] || ''),
        ]
        const aoa = [header]
        for (let r = g.dataStart; r < g.rows.length; r++) {
          const row = g.rows[r]
          if (!row || row.every(c => String(c ?? '').trim() === '')) continue
          const f = byId.get(idOf(row))
          if (!f) continue
          aoa.push([
            ...idCols.map(i => row[i] ?? ''),
            f.total, f.counted, f.excluded,
            f.excludedBy.map(e => `${e.label} x${e.hours}`).join(' | '),
            ...restCols.map(i => row[i] ?? ''),
          ])
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Faculty TT + Workload')
      }

      add(result.faculty.map(f => ({
        'Emp No': f.id, Name: f.name || '', Campus: f.campus || '',
        'Total hours': f.total,
        'Counted workload': f.counted,
        'Excluded hours': f.excluded,
        'Courses': f.courses, 'Counted courses': f.countedCourses,
        'Rooms': f.rooms, 'Days': f.days,
        'Excluded from': f.excludedBy.map(e => `${e.label} x${e.hours}`).join(' | '),
      })), 'Workload')

      const slots = []
      for (const f of result.faculty)
        for (const s of f.slots) slots.push({
          'Emp No': f.id, Name: f.name || '',
          Day: DAY_SHORT[s.day - 1], Period: s.hour,
          'Course Code': s.code || '', Type: s.component ? COMP_LABEL[s.component] || s.component : '',
          'Offering Level (Year)': s.year ?? '', Section: s.section || '',
          Room: s.room || '', Degree: s.degree || '',
          'Counts toward workload': s.excluded ? 'No' : 'Yes',
        })
      add(slots, 'Timetable')

      add(result.excludedCourses.map(c => ({
        'Course Code': c.code,
        'Offering Level (Year)': c.year ?? 'all years',
        'Hours excluded': c.hours,
      })), 'Excluded Courses')

      add(rules.map(r => ({
        'Course Code': r.code, 'Offering Level (Year)': r.year ?? 'all years',
      })), 'Exclusion Rules')

      const s = result.stats
      add([
        { Metric: 'Source file', Value: fileName },
        { Metric: 'Faculty on roster', Value: s.facultyCount },
        { Metric: 'Faculty with classes', Value: s.withClasses },
        { Metric: 'Faculty with no classes', Value: s.idle },
        { Metric: 'Total scheduled hours', Value: s.totalHours },
        { Metric: 'Counted workload hours', Value: s.countedHours },
        { Metric: 'Excluded hours', Value: s.excludedHours },
        { Metric: 'Faculty affected by exclusions', Value: s.affectedFaculty },
        { Metric: 'Exclusion rules applied', Value: s.rulesApplied },
        { Metric: 'Highest counted load', Value: s.maxCounted },
      ], 'Summary')

      XLSX.writeFile(wb, `faculty-workload-${(fileName || 'export').replace(/\.[^.]+$/, '')}.xlsx`)
    } catch (err) {
      console.error('Export failed:', err)
      toast.error(`Export failed: ${err?.message || err}`)
    }
  }

  const s = result?.stats

  return (
    <div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-2)' }}>
        Give it a Faculty-wise timetable and it shows each teacher’s week and their workload.
        Re-registration and slow-learner courses are taught but do not count as load, so list those
        below and they are held out of the totals while still showing in the timetable.
      </p>

      <div style={{ padding: 14, background: 'var(--surface-2)', border: '1px dashed var(--border)',
        borderRadius: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
          Pick a Faculty-wise timetable (.csv or .xlsx). It is read in your browser and downloaded —
          <strong> nothing is uploaded and nothing is saved</strong>.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="input"
            onChange={e => convertFile(e.target.files?.[0])}
            style={{ flex: 1, minWidth: 220, fontSize: 12 }} />
          {result && <button className="btn btn-success" onClick={download}>📥 Download Excel</button>}
        </div>
        {fileName && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
            {busy ? 'Reading… ' : 'Loaded: '}{fileName}
            {parsed && ` · ${parsed.slotColumns} day/period columns`}
          </div>
        )}
      </div>

      <p style={lSt}>COURSES THAT DO NOT COUNT AS WORKLOAD — RE-REGISTRATION &amp; SLOW LEARNER</p>
      <div style={{ padding: 12, background: 'var(--surface-2)', border: '1px dashed var(--border)',
        borderRadius: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>
          Upload the re-registration and slow-learner lists, or type them below. Pick
          <strong> several files at once</strong> — COE and MHS come as separate lists and are merged
          here, with anything on both counted once. A sheet with a <strong>Course Code</strong> column
          and a <strong>Year</strong> (or <strong>Offering Level</strong>) column is read directly;
          a plain two-column list works too.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input ref={ruleFileRef} type="file" accept=".csv,.xlsx,.xls" className="input" multiple
            onChange={e => loadRuleFiles(e.target.files)}
            style={{ flex: 1, minWidth: 220, fontSize: 12 }} />
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }}
            onClick={() => {
              const rows = [
                { 'Course Code': '23IE4053A', 'Year': 4 },
                { 'Course Code': '25CS2101',  'Year': 2 },
                { 'Course Code': '26SC1101',  'Year': '' },
              ]
              const wb = XLSX.utils.book_new()
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Exclusions')
              XLSX.writeFile(wb, 'exclusion-list-template.xlsx')
            }}>
            ⬇ Template
          </button>
          {rulesText.trim() && (
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }}
              onClick={() => { setRules(''); setRuleFiles([]) }}>Clear list</button>
          )}
        </div>
        {ruleFiles.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {ruleFiles.map(f => (
                <span key={f.name} style={{
                  fontSize: 11, padding: '3px 9px', borderRadius: 999,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                }}>
                  📄 {f.name} <strong>{f.count}</strong>
                  <button onClick={() => setRuleFiles(p => p.filter(x => x.name !== f.name))}
                    title="Remove from this list — lines already merged stay in the box"
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-3)', marginLeft: 4, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
              Merged into {rulesText.split(/\r?\n/).filter(l => l.trim()).length} line(s) below —
              edit if needed. Leave the year blank to exclude a course in every year.
            </div>
          </div>
        )}
      </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ flex: '1 1 320px', minWidth: 260 }}>
              <textarea
                className="input"
                value={rulesText}
                onChange={e => setRules(e.target.value)}
                rows={6}
                spellCheck={false}
                placeholder={'One per line:\n23IE4053A            all years\n23IE4053A, 4         only Offering Level 4\n25CS2101 2 3         years 2 and 3\n# lines starting with # are ignored'}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                Course code, then the year(s) it should be excluded for. Leave the year off to exclude
                it everywhere. “Offering Level” in the file is the year of study.
              </div>
              {errors.length > 0 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11, color: '#b45309' }}>
                  {errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
            <div style={{ flex: '1 1 260px', minWidth: 220 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>
                {rules.length} rule(s) active
                {result?.excludedCourses.length ? ` · matching ${result.excludedCourses.length} course/year combination(s)` : ''}
              </div>
              {result?.excludedCourses.length > 0 ? (
                <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={thSt}>Course</th><th style={thSt}>Year</th>
                      <th style={{ ...thSt, textAlign: 'right' }}>Hours</th>
                    </tr></thead>
                    <tbody>
                      {result.excludedCourses.map(c => (
                        <tr key={`${c.code}|${c.year}`}>
                          <td style={{ ...tdSt, fontFamily: 'monospace' }}>{c.code}</td>
                          <td style={tdSt}>{c.year ?? 'all'}</td>
                          <td style={{ ...tdSt, textAlign: 'right' }}>{c.hours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-3)', padding: 10,
                  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  {rules.length
                    ? 'No hours in this file match those rules yet — check the code and year.'
                    : 'No exclusions yet, so every scheduled hour counts as workload.'}
                </div>
              )}
            </div>
          </div>

      {parsed && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <Stat label="FACULTY" value={s.facultyCount} sub={`${s.idle} with no classes`} />
            <Stat label="SCHEDULED HOURS" value={s.totalHours.toLocaleString()} sub="in the file" />
            <Stat label="COUNTED WORKLOAD" value={s.countedHours.toLocaleString()} sub="after exclusions" color="#059669" />
            <Stat label="EXCLUDED HOURS" value={s.excludedHours.toLocaleString()}
              sub={`${s.affectedFaculty} faculty affected`} color={s.excludedHours ? '#f59e0b' : 'var(--text-3)'} />
            <Stat label="HIGHEST LOAD" value={s.maxCounted} sub="hours for one teacher" color="#0ea5e9" />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <input className="input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name or Emp No…" style={{ maxWidth: 240, fontSize: 12 }} />
            <select className="input" value={sort} onChange={e => setSort(e.target.value)} style={{ maxWidth: 190, fontSize: 12 }}>
              <option value="LOAD">Sort by counted load</option>
              <option value="EXCL">Sort by excluded hours</option>
              <option value="NAME">Sort by name</option>
              <option value="ID">Sort by Emp No</option>
            </select>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={showExcludedOnly} onChange={e => setExcludedOnly(e.target.checked)} />
              Only faculty with excluded hours
            </label>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{rows.length} shown</span>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 560, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={thSt}>Emp No</th>
                  <th style={thSt}>Name</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Total</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Workload</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Excluded</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Courses</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Days</th>
                  <th style={thSt}>Excluded from</th>
                  <th style={thSt}>Week</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(f => (
                  <>
                    <tr key={f.id}>
                      <td style={{ ...tdSt, fontFamily: 'monospace', fontWeight: 700 }}>{f.id}</td>
                      <td style={tdSt}>{f.name || '—'}</td>
                      <td style={{ ...tdSt, textAlign: 'right', color: 'var(--text-3)' }}>{f.total}</td>
                      <td style={{ ...tdSt, textAlign: 'right', fontWeight: 800, color: '#059669' }}>{f.counted}</td>
                      <td style={{ ...tdSt, textAlign: 'right', color: f.excluded ? '#b45309' : 'var(--text-3)' }}>{f.excluded || '—'}</td>
                      <td style={{ ...tdSt, textAlign: 'right' }}>{f.courses}</td>
                      <td style={{ ...tdSt, textAlign: 'right' }}>{f.days}</td>
                      <td style={{ ...tdSt, fontSize: 11 }}>
                        {f.excludedBy.length
                          ? f.excludedBy.map(e => `${e.label} ×${e.hours}`).join(', ')
                          : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td style={tdSt}>
                        {f.total > 0 && (
                          <button onClick={() => setOpenId(openId === f.id ? null : f.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontSize: 11, textDecoration: 'underline dotted', padding: 0 }}>
                            {openId === f.id ? 'hide' : 'show'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {openId === f.id && (
                      <tr key={`${f.id}-grid`}>
                        <td colSpan={9} style={{ ...tdSt, background: 'var(--surface-2)' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                            {f.name || f.id} — {f.counted} counted of {f.total} scheduled hours
                          </div>
                          <WeekGrid faculty={f} maxHour={maxHour} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {!rows.length && (
                  <tr><td colSpan={9} style={{ ...tdSt, color: 'var(--text-3)' }}>No faculty match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
