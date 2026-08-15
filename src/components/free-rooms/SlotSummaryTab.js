'use client'
import { useState, useMemo } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { useApi } from '@/components/AuthContext'
import { COMPONENT_NAME } from '@/lib/roomLabel'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const CAT_COLOR = {
  COE: '#c9122a', MHS: '#2563eb', CRT: '#7c3aed',
  FED: '#059669', COR: '#d97706', UNSPECIFIED: '#6b7280',
}

const lSt = { fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em', margin: '0 0 8px' }
const thSt = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', borderBottom: '2px solid var(--border)', background: 'var(--surface-2)', whiteSpace: 'nowrap' }
const tdSt = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid var(--border)' }

// ── Occupied / Free tile per allocation category ────────────────────────────
function RoomTile({ stat }) {
  const pct = stat.total ? Math.round((stat.occupied / stat.total) * 100) : 0
  const color = CAT_COLOR[stat.category] || 'var(--text-2)'
  return (
    <div className="card" style={{ padding: 14, minWidth: 150, flex: '1 1 150px' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: '.05em', marginBottom: 8 }}>
        {stat.category}
      </div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', lineHeight: 1 }}>{stat.occupied}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>OCCUPIED</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{stat.free}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>FREE</div>
        </div>
      </div>
      <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .4s' }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5 }}>{pct}% of {stat.total} rooms</div>
    </div>
  )
}

// ── Programme × Year pivot for one category ─────────────────────────────────
function PivotTable({ title, rows, years, onCell }) {
  const color = CAT_COLOR[title] || 'var(--brand)'
  if (!rows.length) return (
    <div style={{ flex: '1 1 380px' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color, marginBottom: 8 }}>{title}</div>
      <div style={{ padding: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-3)' }}>
        No {title} sections running in this slot.
      </div>
    </div>
  )
  const colTotal = y => rows.reduce((s, r) => s + (r.years[y] || 0), 0)
  return (
    <div style={{ flex: '1 1 380px', minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color, marginBottom: 8 }}>{title}</div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 340 }}>
          <thead>
            <tr>
              <th style={{ ...thSt, textAlign: 'left' }}>Programme</th>
              {years.map(y => <th key={y} style={{ ...thSt, textAlign: 'center' }}>Year {y}</th>)}
              <th style={{ ...thSt, textAlign: 'center' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.program}>
                <td style={{ ...tdSt, fontWeight: 700 }}>{r.program}</td>
                {years.map(y => {
                  const n = r.years[y] || 0
                  return (
                    <td key={y} style={{ ...tdSt, textAlign: 'center' }}>
                      {n
                        ? <button
                            onClick={() => onCell(r.category, r.program, y)}
                            title="Show courses running"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 800, color, textDecoration: 'underline dotted', padding: '2px 6px' }}
                          >{n}</button>
                        : <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                  )
                })}
                <td style={{ ...tdSt, textAlign: 'center', fontWeight: 800 }}>{r.total}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...tdSt, fontWeight: 800, background: 'var(--surface-2)' }}>All sections</td>
              {years.map(y => (
                <td key={y} style={{ ...tdSt, textAlign: 'center', fontWeight: 800, background: 'var(--surface-2)' }}>{colTotal(y)}</td>
              ))}
              <td style={{ ...tdSt, textAlign: 'center', fontWeight: 800, background: 'var(--surface-2)' }}>
                {rows.reduce((s, r) => s + r.total, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Course list modal ───────────────────────────────────────────────────────
function CourseModal({ cell, courses, onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="card fade-up" style={{ width: '100%', maxWidth: 680, padding: 24, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", color: 'var(--brand)', fontSize: '1.05rem' }}>
              {cell.program} — Year {cell.year}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
              {courses.length} course{courses.length === 1 ? '' : 's'} running
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thSt, textAlign: 'left' }}>Course</th>
                <th style={{ ...thSt, textAlign: 'left' }}>Type</th>
                <th style={{ ...thSt, textAlign: 'left' }}>Sec</th>
                <th style={{ ...thSt, textAlign: 'left' }}>Room(s)</th>
              </tr>
            </thead>
            <tbody>
              {courses.map(c => (
                <tr key={`${c.course_code}|${c.component}|${c.section}`}>
                  <td style={{ ...tdSt, fontWeight: 700, fontFamily: 'monospace' }}>{c.course_code}</td>
                  <td style={{ ...tdSt }}>
                    <span style={{ fontWeight: 700 }}>{c.component}</span>
                    <span style={{ color: 'var(--text-3)', fontSize: 11, marginLeft: 5 }}>{COMPONENT_NAME[c.component]}</span>
                  </td>
                  <td style={{ ...tdSt }}>{c.section}</td>
                  <td style={{ ...tdSt, fontSize: 12 }}>{c.rooms.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {courses[0]?.label}
        </div>
      </div>
    </div>
  )
}

// ── Tab ─────────────────────────────────────────────────────────────────────
export default function SlotSummaryTab() {
  const { get } = useApi()
  const [day, setDay]         = useState('1')
  const [periods, setPeriods] = useState([])
  const [data, setData]       = useState(null)
  const [busy, setBusy]       = useState(false)
  const [cell, setCell]       = useState(null)

  const run = async () => {
    if (!periods.length) return toast.error('Select at least one period')
    setBusy(true); setCell(null)
    try {
      const d = await get(`/api/free/slot-summary?day=${day}&periods=${periods.join(',')}`)
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setData(null); return toast.error(d.message) }
      setData(d)
      const n = (d.groups.COE.length + d.groups.MHS.length)
      toast.success(n ? `${n} programmes running` : 'Nothing scheduled in this slot')
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const years = useMemo(() => {
    if (!data) return [1, 2, 3, 4]
    const s = new Set()
    for (const g of Object.values(data.groups)) for (const r of g) Object.keys(r.years).forEach(y => s.add(+y))
    return s.size ? [...s].sort((a, b) => a - b) : [1, 2, 3, 4]
  }, [data])

  const download = () => {
    if (!data) return toast.error('Run the analysis first')
    const wb = XLSX.utils.book_new()
    const slot = `${DAYS[+day - 1]} P${data.periods.join(',')}`

    for (const cat of ['COE', 'MHS']) {
      const rows = data.groups[cat].map(r => {
        const o = { Programme: r.program }
        years.forEach(y => { o[`Year ${y}`] = r.years[y] || 0 })
        o.Total = r.total
        return o
      })
      if (!rows.length) rows.push({ Programme: `No ${cat} sections in ${slot}` })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `${cat} Sections`)
    }

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.rooms.byCategory.map(s => ({
        Category: s.category, 'Total Rooms': s.total, Occupied: s.occupied, Free: s.free,
        'Occupied %': s.total ? Math.round((s.occupied / s.total) * 100) : 0,
      })).concat([{ Category: 'Occupied (not in room master)', 'Total Rooms': '', Occupied: data.rooms.uncategorisedOccupied, Free: '', 'Occupied %': '' }])
    ), 'Rooms')

    const detail = []
    for (const [key, list] of Object.entries(data.courses)) {
      const [category, program, year] = key.split('|')
      for (const c of list) detail.push({
        Category: category, Programme: program, Year: year,
        'Course Code': c.course_code, Type: c.component, Section: c.section,
        Rooms: c.rooms.join(' | '), Hours: c.hours.join(','), Label: c.label,
      })
    }
    if (detail.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Course Detail')

    XLSX.writeFile(wb, `slot-summary-${DAYS[+day - 1]}-P${data.periods.join('')}.xlsx`)
  }

  const cellCourses = cell ? (data?.courses[`${cell.category}|${cell.program}|${cell.year}`] || []) : []

  return (
    <div>
      <p style={lSt}>STEP 1 — Pick a day &amp; the hour(s) to analyse</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select className="input" value={day} onChange={e => setDay(e.target.value)} style={{ maxWidth: 170 }}>
          {DAYS.map((d, i) => <option key={i + 1} value={i + 1}>{d}</option>)}
        </select>
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? 'Analysing…' : 'Analyse Slot'}
        </button>
        {data && <button className="btn btn-success" onClick={download}>📥 Export Excel</button>}
      </div>
      <PeriodPicker selected={periods} onChange={setPeriods} max={24} />

      {data && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
            <strong style={{ color: 'var(--text-2)' }}>{DAYS[+day - 1]} · hour(s) {data.periods.join(', ')}</strong>
            {' — '}{data.entryCount} room-timetable rows · source: {data.snapshot}
            {data.unparsed > 0 && <span style={{ color: '#f59e0b' }}> · {data.unparsed} label(s) unreadable</span>}
          </div>

          <p style={lSt}>ROOMS OCCUPIED vs FREE</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            {data.rooms.byCategory.map(s => <RoomTile key={s.category} stat={s} />)}
          </div>
          {data.rooms.uncategorisedOccupied > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>
              ⚠️ {data.rooms.uncategorisedOccupied} occupied room(s) are not in the room master, so they are
              excluded from the counts above. Free figures cover the {data.rooms.masterTotal} known rooms only.
            </div>
          )}

          <p style={{ ...lSt, marginTop: 20 }}>SECTIONS RUNNING — click a count to see the courses</p>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <PivotTable title="COE" rows={data.groups.COE} years={years}
              onCell={(category, program, year) => setCell({ category, program, year })} />
            <PivotTable title="MHS" rows={data.groups.MHS} years={years}
              onCell={(category, program, year) => setCell({ category, program, year })} />
          </div>
        </div>
      )}

      {cell && <CourseModal cell={cell} courses={cellCourses} onClose={() => setCell(null)} />}
    </div>
  )
}
