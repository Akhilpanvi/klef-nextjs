'use client'
import { useState, useEffect, useMemo } from 'react'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useAuth, useApi } from '@/components/AuthContext'
import TimetableGrid from '@/components/timetable/TimetableGrid'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const DAYS      = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_FULL  = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' }
const DESG_LABEL = { R: 'Research', Ac: 'Academic', Ad: 'Administrative' }
const SEV_LABEL  = { severe: 'SEVERE', warn: 'WARNING', info: 'INFO' }
const TYPE_ICON  = { 'Room Overlap': '🔴', 'Dual Faculty': '🟡', 'Faculty Double-Booked': '🔵' }

const lSt  = { fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em', margin: '0 0 8px' }
const thSt = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', borderBottom: '2px solid var(--border)', background: 'var(--surface-2)', whiteSpace: 'nowrap', textAlign: 'left' }
const tdSt = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid var(--border)' }

/** Which ERP files answered the question, shown once per sub-tab. */
function SourceNote({ sources, counts, extra }) {
  if (!sources) return null
  const bits = []
  if (sources.roomwise)    bits.push(`Room-wise TT ${sources.roomwise.rows.toLocaleString()} rows`)
  if (sources.facultywise) bits.push(`Faculty-wise TT ${sources.facultywise.rows.toLocaleString()} rows`)
  return (
    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
      ERP sources — {bits.join(' · ') || 'none uploaded'}
      {counts && ` · merged to ${(counts.facultywise + counts.roomwise).toLocaleString()} classes`}
      {extra}
      {(!sources.roomwise || !sources.facultywise) && (
        <span style={{ color: '#f59e0b' }}>
          {' '}· {!sources.facultywise ? 'Faculty-wise TT missing — no faculty names' : 'Room-wise TT missing'}
        </span>
      )}
    </div>
  )
}

function ProfileCard({ data, load }) {
  if (!data && !load) return null
  const fields = [
    { label: 'Emp No', value: data?.eid },
    { label: 'Department (DPET)', value: data?.dept },
    { label: 'Designation', value: data?.designation },
    { label: 'Category', value: data?.designation_category
      ? `${data.designation_category} — ${DESG_LABEL[data.designation_category] || data.designation_category}` : null },
    { label: 'Assigned Responsibility', value: data?.assigned_responsibility },
    { label: 'Cohort', value: data?.cohort_name ? `${data.cohort} — ${data.cohort_name}` : data?.cohort },
    { label: 'Phone', value: data?.phone },
    { label: 'Email', value: data?.email },
    { label: 'Designation Load', value: data?.load_as_per_designation != null ? `${data.load_as_per_designation} hrs` : null },
    { label: 'Permissible Load', value: data?.pl != null ? `${data.pl} hrs` : null },
    { label: 'Actual Load (ERP)', value: load ? `${load.slots} hrs` : null },
    { label: 'Utilisation', value: load && data?.pl ? `${Math.round((load.slots / data.pl) * 100)}%` : null },
    { label: 'Courses', value: load?.courses },
    { label: 'Rooms used', value: load?.rooms },
  ].filter(f => f.value != null && f.value !== '')

  if (!fields.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginBottom: 20,
      padding: 16, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
      {fields.map(f => (
        <div key={f.label}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{f.label}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{f.value}</div>
        </div>
      ))}
    </div>
  )
}

// ── Sub-tab 1: Timetable ────────────────────────────────────────────────────
function ErpTimetable() {
  const { get } = useApi()
  const [type, setType]   = useState('faculty')
  const [query, setQuery] = useState('')
  const [roster, setRoster] = useState([])
  const [result, setResult] = useState(null)
  const [busy, setBusy]   = useState(false)

  useEffect(() => {
    get('/api/erp/timetable?list=faculty')
      .then(d => { if (d.success) setRoster(d.faculty || []) })
      .catch(() => {})
  }, [])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (type !== 'faculty' || q.length < 2) return []
    return roster
      .filter(f => String(f.id).includes(q) || (f.name || '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, roster, type])

  const run = async (q = query) => {
    if (!q.trim()) return toast.error('Enter a name, Emp No or room')
    setBusy(true)
    try {
      const d = await get(`/api/erp/timetable?type=${type}&q=${encodeURIComponent(q.trim())}`)
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setResult(null); return toast.error(d.message) }
      if (!d.found)  { setResult(d); return toast.error(d.message) }
      setResult(d)
      toast.success(`${d.load.slots} class hour(s) · ${d.clashes.length} clash(es) in those slots`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <p style={lSt}>SEARCH THE ERP TIMETABLE</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {['faculty', 'room'].map(t => (
          <button key={t} onClick={() => { setType(t); setResult(null) }} style={{
            padding: '6px 16px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${type === t ? 'var(--brand)' : 'var(--border)'}`,
            background: type === t ? 'var(--brand)' : 'transparent',
            color: type === t ? '#fff' : 'var(--text-2)', textTransform: 'capitalize',
          }}>{t}</button>
        ))}
        <input className="input" value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run()}
          placeholder={type === 'faculty' ? 'Faculty name or Emp No…' : 'Room number, e.g. C207'}
          style={{ flex: 1, minWidth: 220 }} />
        <button className="btn btn-primary" onClick={() => run()} disabled={busy}>
          {busy ? 'Loading…' : 'Show timetable'}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {suggestions.map(f => (
            <button key={f.id} onClick={() => { setQuery(String(f.id)); run(String(f.id)) }}
              className="pill" style={{ fontSize: 11 }}>
              {f.name || f.id} <span style={{ color: 'var(--text-3)' }}>· {f.id}{f.dept ? ` · ${f.dept}` : ''}</span>
            </button>
          ))}
        </div>
      )}

      {roster.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
          {roster.length.toLocaleString()} faculty in the ERP grid
        </div>
      )}

      {result && !result.found && (
        <div style={{ padding: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text-2)' }}>
          {result.message}
        </div>
      )}

      {result?.found && (
        <div>
          <SourceNote sources={result.sources} counts={result.counts} />
          <h3 style={{ margin: '0 0 4px', fontFamily: "'DM Serif Display',serif", color: 'var(--brand)', fontSize: '1.1rem' }}>
            {result.title}
          </h3>
          {result.subtitle && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>{result.subtitle}</div>
          )}
          <ProfileCard data={result.profile} load={result.load} />
          {result.type === 'room' && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
              {result.load.slots} class hour(s) · {result.load.faculty} faculty · {result.load.courses} course(s)
            </div>
          )}
          <TimetableGrid
            title={result.type === 'room' ? `Room ${result.title}` : result.title}
            badge={`${result.load.slots} hrs`}
            entries={result.entries}
            mode={result.type}
            showAllHours
            clashes={result.clashes}
          />
        </div>
      )}
    </div>
  )
}

// ── Sub-tab 2: Free Faculty ─────────────────────────────────────────────────
function ErpFreeFaculty() {
  const { get } = useApi()
  const [days, setDays]       = useState([1])
  const [periods, setPeriods] = useState([])
  const [data, setData]       = useState(null)
  const [busy, setBusy]       = useState(false)
  const [selDepts, setSelDepts] = useState([])
  const [search, setSearch]   = useState('')
  const [sort, setSort]       = useState('ID')

  const toggleDay = d => setDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort())

  const check = async () => {
    if (!days.length)    return toast.error('Select at least one day')
    if (!periods.length) return toast.error('Select at least one period')
    setBusy(true)
    try {
      const d = await get(`/api/erp/free-faculty?days=${days.join(',')}&periods=${periods.join(',')}`)
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setData(null); return toast.error(d.message) }
      setData(d); setSelDepts([])
      toast.success(`${d.count} free faculty of ${d.totals.roster}`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const allDepts = useMemo(() =>
    [...new Set((data?.faculty || []).map(f => f.dept).filter(Boolean))].sort(), [data])
  const toggleDept = d => setSelDepts(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.faculty
      .filter(f => !selDepts.length || selDepts.includes(f.dept))
      .filter(f => !search ||
        (f.name || '').toLowerCase().includes(search.toLowerCase()) ||
        String(f.id).includes(search))
      .sort((a, b) => sort === 'NAME'
        ? String(a.name || '').localeCompare(String(b.name || ''))
        : String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
  }, [data, selDepts, search, sort])

  const download = () => {
    if (!filtered.length) return toast.error('Nothing to export')
    const ws = XLSX.utils.json_to_sheet(filtered.map(f => ({
      'Emp No': f.id, Name: f.name || '', 'Dept (DPET)': f.dept || '',
      Designation: f.designation || '', 'Assigned Responsibility': f.responsibility || '',
      Cohort: f.cohort || '', 'Cohort Name': f.cohort_name || '',
      Phone: f.phone || '', Email: f.email || '', Campus: f.campus || '',
      'Designation Load': f.designationLoad ?? '', 'Permissible Load': f.permissibleLoad ?? '',
      'Weekly Load (ERP)': f.weeklyLoad, 'Courses (week)': f.weeklyCourses ?? '',
      'FD record': f.hasFd ? 'matched' : 'no FD row',
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ERP Free Faculty')
    XLSX.writeFile(wb, `erp-free-faculty-${days.map(d => DAY_SHORT[d - 1]).join('')}-P${periods.join('')}.xlsx`)
  }

  return (
    <div>
      <p style={lSt}>STEP 1 — Pick day(s)</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <button onClick={() => setDays(days.length === 6 ? [] : [1, 2, 3, 4, 5, 6])} style={{
          padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
          border: `1px solid ${days.length === 6 ? 'var(--brand)' : 'var(--border)'}`,
          background: days.length === 6 ? 'var(--brand)' : 'transparent',
          color: days.length === 6 ? '#fff' : 'var(--text-2)',
        }}>{days.length === 6 ? 'All week selected' : 'Select all week'}</button>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{days.length} day(s)</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {DAY_SHORT.map((d, i) => {
          const on = days.includes(i + 1)
          return (
            <button key={d} onClick={() => toggleDay(i + 1)} title={DAYS[i]} style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
              background: on ? 'var(--brand)' : 'transparent',
              color: on ? '#fff' : 'var(--text-2)',
            }}>{d}</button>
          )
        })}
      </div>

      <p style={lSt}>STEP 2 — Pick hour(s)</p>
      <PeriodPicker selected={periods} onChange={setPeriods} max={24} quick />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <button className="btn btn-primary" onClick={check} disabled={busy}>
          {busy ? 'Checking…' : 'Check availability'}
        </button>
        {data && <button className="btn btn-success" onClick={download}>📥 Export Excel</button>}
      </div>

      {data && (
        <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
            <strong style={{ color: 'var(--text-2)' }}>
              {days.map(d => DAY_SHORT[d - 1]).join(', ')} · hour(s) {periods.join(', ')}
            </strong>
            {' — '}{data.totals.free} free · {data.totals.busy} teaching · {data.totals.roster} on the ERP roster
            {data.totals.withoutFd > 0 && (
              <span style={{ color: '#f59e0b' }}> · {data.totals.withoutFd} without an FD record</span>
            )}
          </div>

          <p style={lSt}>FILTER BY DEPARTMENT (from FD) — {allDepts.length} dept(s)</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, maxHeight: 140, overflowY: 'auto' }}>
            {allDepts.map(d => (
              <button key={d} className={`pill${selDepts.includes(d) ? ' active' : ''}`} onClick={() => toggleDept(d)}>
                {d}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <select className="input" value={sort} onChange={e => setSort(e.target.value)} style={{ maxWidth: 150 }}>
              <option value="ID">Sort by Emp No</option>
              <option value="NAME">Sort by Name</option>
            </select>
            <input className="input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name or Emp No…" style={{ flex: 1, minWidth: 160 }} />
            <span style={{ fontWeight: 700, color: 'var(--brand)', fontSize: 14 }}>{filtered.length} shown</span>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 560, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={thSt}>Emp No</th>
                  <th style={thSt}>Name</th>
                  <th style={thSt}>Dept</th>
                  <th style={thSt}>Designation</th>
                  <th style={thSt}>Responsibility</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Week load / PL</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => (
                  <tr key={f.id}>
                    <td style={{ ...tdSt, fontFamily: 'monospace', fontWeight: 700 }}>{f.id}</td>
                    <td style={tdSt}>{f.name || '—'}</td>
                    <td style={{ ...tdSt, fontSize: 12 }}>{f.dept || '—'}</td>
                    <td style={{ ...tdSt, fontSize: 12 }}>{f.designation || '—'}</td>
                    <td style={{ ...tdSt, fontSize: 12 }}>{f.responsibility || '—'}</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontSize: 12 }}>
                      {f.weeklyLoad}<span style={{ color: 'var(--text-3)' }}> / {f.permissibleLoad ?? '—'}</span>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={6} style={{ ...tdSt, color: 'var(--text-3)' }}>No faculty match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-tab 3: Clashes ──────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '16px 18px', textAlign: 'center', minWidth: 110, flex: '1 1 110px' }}>
      <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1, fontFamily: "'DM Serif Display',serif" }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginTop: 4, letterSpacing: '.04em' }}>{label}</div>
    </div>
  )
}

function ClashCard({ c }) {
  return (
    <div className={`clash-card clash-${c.severity}`}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999,
          background: c.severity === 'severe' ? '#fecdd3' : c.severity === 'warn' ? '#fef3c7' : '#dbeafe',
          color: c.severity === 'severe' ? '#9f1239' : c.severity === 'warn' ? '#92400e' : '#1e40af',
          textTransform: 'uppercase', letterSpacing: '.05em',
        }}>{SEV_LABEL[c.severity]}</span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{TYPE_ICON[c.type]} {c.type}</span>
        <span style={{ fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 9px', color: 'var(--text-2)' }}>
          {DAY_FULL[c.day]} · Period {c.hour}
        </span>
        <span style={{ fontSize: 12, background: '#dbeafe', color: '#1e40af', borderRadius: 6, padding: '2px 9px', fontWeight: 600 }}>
          📍 {c.room} <em style={{ fontWeight: 400 }}>({c.roomType})</em>
        </span>
      </div>
      <div className="clash-detail-grid">
        <div><span style={{ fontSize: 11, color: 'var(--text-3)' }}>Course 1</span><br /><b>{c.courseCode1}</b></div>
        <div><span style={{ fontSize: 11, color: 'var(--text-3)' }}>Course 2</span><br /><b>{c.courseCode2}</b></div>
        <div><span style={{ fontSize: 11, color: 'var(--text-3)' }}>Sections</span><br />{c.section}</div>
        <div><span style={{ fontSize: 11, color: 'var(--text-3)' }}>Faculty</span><br />
          {c.faculty1}{c.faculty1 !== c.faculty2 ? ` & ${c.faculty2}` : ''}
        </div>
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,.08)', fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
        {c.desc}
      </div>
    </div>
  )
}

function ErpClashes() {
  const { get } = useApi()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [typeF, setTypeF] = useState('')
  const [dayF, setDayF]   = useState('')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(60)

  const run = async () => {
    setBusy(true)
    try {
      const d = await get('/api/erp/clashes')
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setData(null); return toast.error(d.message) }
      setData(d); setLimit(60)
      toast.success(`${d.stats.total} clash(es) — ${d.stats.severe} severe`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.clashes
      .filter(c => !typeF || c.type === typeF)
      .filter(c => !dayF || String(c.day) === dayF)
      .filter(c => !q ||
        [c.room, c.courseCode1, c.courseCode2, c.faculty1, c.faculty2, c.section]
          .some(v => String(v || '').toLowerCase().includes(q)))
  }, [data, typeF, dayF, search])

  const download = () => {
    if (!filtered.length) return toast.error('Nothing to export')
    const ws = XLSX.utils.json_to_sheet(filtered.map(c => ({
      Severity: SEV_LABEL[c.severity], Type: c.type,
      Day: DAY_FULL[c.day], Period: c.hour,
      Room: c.room, 'Room Type': c.roomType,
      'Course 1': c.courseCode1, 'Course 2': c.courseCode2,
      Sections: c.section, 'Faculty 1': c.faculty1, 'Faculty 2': c.faculty2,
      Description: c.desc,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ERP Clashes')
    XLSX.writeFile(wb, 'erp-clashes.xlsx')
  }

  const types = useMemo(() =>
    [...new Set((data?.clashes || []).map(c => c.type))].sort(), [data])

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? 'Scanning…' : data ? 'Re-scan ERP data' : 'Scan ERP data for clashes'}
        </button>
        {data && <button className="btn btn-success" onClick={download}>📥 Export Excel</button>}
      </div>

      {data && (
        <div>
          <SourceNote sources={data.sources} counts={data.counts} />

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            <StatCard label="Total" value={data.stats.total} color="var(--brand)" />
            <StatCard label="Severe" value={data.stats.severe} color="#e11d48" />
            <StatCard label="Warning" value={data.stats.warn} color="#f59e0b" />
            <StatCard label="Info" value={data.stats.info} color="#3b82f6" />
            <StatCard label="Slots hit" value={data.stats.slotsAffected} color="var(--text-2)" />
            <StatCard label="Rooms hit" value={data.stats.roomsAffected} color="var(--text-2)" />
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14, padding: 10,
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-2)' }}>What this source can and cannot show.</strong><br />
            <b>Room Overlap</b> is detected normally — two different courses sharing a room in one period.<br />
            <b>Dual Faculty</b> is not reported. The room-wise grid puts the associative section in the
            room name (C007-MA, C007-A, C007-B: main plus supporting faculty on one class) while the
            faculty-wise grid records the plain room with no suffix, so nothing separates a main
            teacher from a supporting one. Several faculty on the same room, course and section are
            support staff, not a clash
            {data.stats.coTaughtClasses > 0 && (
              <> — {data.stats.coTaughtClasses.toLocaleString()} class-hours here are co-taught,
                {' '}{data.stats.supportingFaculty.toLocaleString()} supporting assignments, up to
                {' '}{data.stats.maxFacultyOnAClass} faculty on one class</>
            )}.<br />
            <b>Faculty Double-Booked</b> is always 0: the grid holds one cell per faculty per period,
            so it cannot record the same teacher in two places.
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <select className="input" value={typeF} onChange={e => setTypeF(e.target.value)} style={{ maxWidth: 190 }}>
              <option value="">All types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="input" value={dayF} onChange={e => setDayF(e.target.value)} style={{ maxWidth: 150 }}>
              <option value="">All days</option>
              {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
            <input className="input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search room, course, faculty…" style={{ flex: 1, minWidth: 180 }} />
            <span style={{ fontWeight: 700, color: 'var(--brand)', fontSize: 14 }}>{filtered.length} shown</span>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {filtered.slice(0, limit).map((c, i) => <ClashCard key={i} c={c} />)}
          </div>
          {filtered.length > limit && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setLimit(l => l + 60)}>
                Show 60 more ({filtered.length - limit} remaining)
              </button>
            </div>
          )}
          {!filtered.length && (
            <div style={{ padding: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text-3)' }}>
              No clashes match these filters.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
const SUBS = [
  { id: 'timetable', label: '📅 Timetable' },
  { id: 'free',      label: '🧑‍🏫 Free Faculty' },
  { id: 'clashes',   label: '⚠ Clashes' },
]

function ErpContent() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [sub, setSub] = useState('timetable')

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])
  if (loading || !user) return null

  return (
    <PortalShell>
      <h2 style={{ margin: '0 0 4px', fontFamily: "'DM Serif Display',serif", fontSize: '1.25rem' }}>ERP</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-3)' }}>
        Built only from the ERP uploads — the Room-wise and Faculty-wise timetables — with faculty
        details from the FD upload. Same constraints as the main pages, different source.
      </p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {SUBS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)} style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: sub === t.id ? '2px solid var(--brand)' : '2px solid transparent',
            color: sub === t.id ? 'var(--brand)' : 'var(--text-2)', marginBottom: -2, transition: 'all .15s',
          }}>{t.label}</button>
        ))}
      </div>

      {sub === 'timetable' && <ErpTimetable />}
      {sub === 'free'      && <ErpFreeFaculty />}
      {sub === 'clashes'   && <ErpClashes />}
    </PortalShell>
  )
}

export default function ErpPage() { return <AuthProvider><ErpContent /></AuthProvider> }
