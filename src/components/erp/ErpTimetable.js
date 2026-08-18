'use client'
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import TimetableGrid from '@/components/timetable/TimetableGrid'
import { useApi } from '@/components/AuthContext'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { syncUrl } from '@/components/erp/ErpShell'
import {
  DAY_SHORT, DAY_FULL, COMP_LABEL, COMP_SHORT, lSt, thSt, tdSt,
  SourceNote, ProfileCard, StatCard,
} from '@/components/erp/shared'

// ── Sub-tab 1: Timetable ────────────────────────────────────────────────────
export default function ErpTimetable() {
  const { get } = useApi()
  const params = useSearchParams()
  const [type, setType]   = useState(() => {
    const t = (params.get('type') || 'faculty').toLowerCase()
    return ['faculty', 'room', 'course'].includes(t) ? t : 'faculty'
  })
  const [query, setQuery] = useState(() => params.get('q') || '')
  const [roster, setRoster] = useState([])
  const [courses, setCourses] = useState([])
  const [result, setResult] = useState(null)
  const [busy, setBusy]   = useState(false)

  useEffect(() => {
    get('/api/erp/timetable?list=faculty')
      .then(d => { if (d.success) setRoster(d.faculty || []) })
      .catch(() => {})
  }, [])

  // A shared or reloaded link already carries the subject — run it so the page
  // comes back exactly as it was left.
  const [autoRan, setAutoRan] = useState(false)
  useEffect(() => {
    if (autoRan) return
    const q = params.get('q')
    if (q) { setAutoRan(true); run(q) }
  }, [])

  // Course list is only needed once the course tab is opened.
  useEffect(() => {
    if (type !== 'course' || courses.length) return
    get('/api/erp/timetable?list=courses')
      .then(d => { if (d.success) setCourses(d.courses || []) })
      .catch(() => {})
  }, [type])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    if (type === 'faculty') {
      return roster
        .filter(f => String(f.id).includes(q) || (f.name || '').toLowerCase().includes(q))
        .slice(0, 8)
        .map(f => ({ key: f.id, value: String(f.id), label: f.name || f.id,
          hint: `${f.id}${f.dept ? ` · ${f.dept}` : ''}` }))
    }
    if (type === 'course') {
      return courses
        .filter(c => c.code.toLowerCase().includes(q))
        .slice(0, 8)
        .map(c => ({ key: c.code, value: c.code, label: c.code,
          hint: `${c.slots} hrs · ${c.sections} sec${c.years.length ? ` · Y${c.years.join('/')}` : ''}` }))
    }
    return []
  }, [query, roster, courses, type])

  const run = async (q = query) => {
    if (!q.trim()) return toast.error('Enter a name, Emp No or room')
    setBusy(true)
    try {
      const d = await get(`/api/erp/timetable?type=${type}&q=${encodeURIComponent(q.trim())}`)
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setResult(null); return toast.error(d.message) }
      if (!d.found)  { setResult(d); return toast.error(d.message) }
      setResult(d)
      syncUrl('/erp/timetable', { type, q: q.trim() })
      toast.success(`${d.load.slots} class hour(s) · ${d.clashes.length} clash(es) in those slots`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const exportCourse = (r) => {
    const rows = (r.sections || []).map(x => ({
      Course: r.title, Section: x.section,
      Type: x.component ? COMP_LABEL[x.component] : '',
      Programme: x.program || '', Year: x.year || '',
      'Class hours': x.slots,
      'Faculty ID': x.faculty.map(f => f.id).join(' | '),
      'Faculty Name': x.faculty.map(f => f.name).filter(Boolean).join(' | '),
      'Faculty count': x.faculty.length,
      Rooms: x.rooms.join(' | '),
      Days: x.days.map(d => DAY_SHORT[d - 1]).join(','),
    }))
    if (!rows.length) return toast.error('Nothing to export')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Sections')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      (r.entries || []).map(e => ({
        Day: DAY_FULL[e.umatdayid], Period: e.umat_hourno,
        Section: e.main_sectionno || '', Type: e.coursedeliverycomponent ? COMP_LABEL[e.coursedeliverycomponent] : '',
        Room: e.room_no || '', 'Faculty ID': e.emp_id || '', 'Faculty Name': e.faculty_name || '',
        Programme: e.program || '', Year: e.year || '', Source: e.source,
      }))), 'Class hours')
    XLSX.writeFile(wb, `erp-course-${r.title}.xlsx`)
  }

  return (
    <div>
      <p style={lSt}>SEARCH THE ERP TIMETABLE</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {['faculty', 'room', 'course'].map(t => (
          <button key={t} onClick={() => { setType(t); setResult(null); syncUrl('/erp/timetable', { type: t }) }} style={{
            padding: '6px 16px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${type === t ? 'var(--brand)' : 'var(--border)'}`,
            background: type === t ? 'var(--brand)' : 'transparent',
            color: type === t ? '#fff' : 'var(--text-2)', textTransform: 'capitalize',
          }}>{t}</button>
        ))}
        <input className="input" value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run()}
          placeholder={type === 'faculty' ? 'Faculty name or Emp No…'
            : type === 'room' ? 'Room number, e.g. C207'
            : 'Course code, e.g. 25CS2101'}
          style={{ flex: 1, minWidth: 220 }} />
        <button className="btn btn-primary" onClick={() => run()} disabled={busy}>
          {busy ? 'Loading…' : 'Show timetable'}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {suggestions.map(sg => (
            <button key={sg.key} onClick={() => { setQuery(sg.value); run(sg.value) }}
              className="pill" style={{ fontSize: 11 }}>
              {sg.label} <span style={{ color: 'var(--text-3)' }}>· {sg.hint}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
        {type === 'course'
          ? `${courses.length.toLocaleString()} courses in the ERP grid`
          : `${roster.length.toLocaleString()} faculty in the ERP grid`}
      </div>

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

          {result.type === 'course' && (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                <StatCard label="Class hours" value={result.load.slots} color="var(--brand)" />
                <StatCard label="Sections" value={result.load.sections} color="#2563eb" />
                <StatCard label="Faculty" value={result.load.faculty} color="#059669" />
                <StatCard label="Rooms" value={result.load.rooms} color="#0ea5e9" />
                <StatCard label="Programmes" value={result.load.programs} color="#a855f7" />
                <StatCard label="Days" value={result.load.days} color="var(--text-2)" />
              </div>

              {result.sections?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <p style={{ ...lSt, margin: '0 0 8px' }}>
                      SECTION BREAKDOWN — {result.sections.length} section/component row(s)
                    </p>
                    <button className="btn btn-success" style={{ fontSize: 12, padding: '5px 12px' }}
                      onClick={() => exportCourse(result)}>📥 Export Excel</button>
                  </div>
                  <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 460, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                      <thead>
                        <tr>
                          <th style={thSt}>Section</th>
                          <th style={thSt}>Type</th>
                          <th style={thSt}>Programme</th>
                          <th style={{ ...thSt, textAlign: 'center' }}>Yr</th>
                          <th style={{ ...thSt, textAlign: 'right' }}>Hrs</th>
                          <th style={thSt}>Faculty</th>
                          <th style={thSt}>Room(s)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.sections.map((r, i) => (
                          <tr key={i}>
                            <td style={{ ...tdSt, fontWeight: 700 }}>{r.section}</td>
                            <td style={{ ...tdSt, fontSize: 12 }}>
                              {r.component ? `${COMP_SHORT[r.component]} · ${COMP_LABEL[r.component]}` : '—'}
                            </td>
                            <td style={{ ...tdSt, fontSize: 12 }}>{r.program || '—'}</td>
                            <td style={{ ...tdSt, textAlign: 'center' }}>{r.year || '—'}</td>
                            <td style={{ ...tdSt, textAlign: 'right' }}>{r.slots}</td>
                            <td style={{ ...tdSt, fontSize: 11 }}>
                              {r.faculty.length
                                ? r.faculty.map(f => (
                                  <div key={f.id} style={{ whiteSpace: 'nowrap' }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{f.id}</span> {f.name || ''}
                                  </div>
                                ))
                                : <span style={{ color: 'var(--text-3)' }}>no faculty in ERP</span>}
                            </td>
                            <td style={{ ...tdSt, fontSize: 11, fontFamily: 'monospace' }}>{r.rooms.join(', ') || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {result.sections.some(r => r.faculty.length > 1) && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
                      Rows with several faculty are co-taught — a main teacher plus supporting
                      faculty on the same section, not a clash.
                    </div>
                  )}
                </div>
              )}
            </>
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
