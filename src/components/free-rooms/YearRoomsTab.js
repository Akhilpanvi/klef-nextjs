'use client'
import { useState, useMemo, Fragment } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { useApi } from '@/components/AuthContext'
import { COMPONENT_NAME, DAY_NAMES } from '@/lib/roomLabel'

const DAY_SHORT  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WING_COLOR = { COE: '#c9122a', MHS: '#2563eb', FED: '#059669' }
const ALL_YEARS  = [1, 2, 3, 4, 5]

const lSt  = { fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em', margin: '0 0 8px' }
const thSt = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', borderBottom: '2px solid var(--border)', background: 'var(--surface-2)', whiteSpace: 'nowrap', textAlign: 'left' }
const tdSt = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid var(--border)' }

const ROOM_VIEWS = [
  { key: 'selected', label: 'Used by selected year(s)', color: '#c9122a' },
  { key: 'other',    label: 'Used by other years',      color: '#f59e0b' },
  { key: 'free',     label: 'Free — nobody in them',    color: '#10b981' },
]

function Pills({ items, value, onToggle, labelOf }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
      {items.map(it => {
        const on = value.includes(it)
        return (
          <button key={it} onClick={() => onToggle(it)} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
            background: on ? 'var(--brand)' : 'transparent',
            color: on ? '#fff' : 'var(--text-2)', transition: 'all .15s',
          }}>{labelOf(it)}</button>
        )
      })}
    </div>
  )
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card fade-up" style={{ width: '100%', maxWidth: 820, padding: 24, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", color: 'var(--brand)', fontSize: '1.05rem' }}>{title}</h2>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, color }) {
  return (
    <div className="card" style={{ padding: 14, minWidth: 150, flex: '1 1 150px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: color || 'var(--text-3)', letterSpacing: '.04em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

/** Programme x year pivot for one wing/degree group. */
function GroupTable({ table, years, onCell }) {
  const color = WING_COLOR[table.wing] || 'var(--brand)'
  const colTotal = y => table.rows.reduce((s, r) => s + (r.years[y] || 0), 0)
  return (
    <div style={{ flex: '1 1 420px', minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color, marginBottom: 2 }}>{table.title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
        {table.programmes} programme(s) · {table.sections} section(s)
      </div>
      {!table.rows.length ? (
        <div style={{ padding: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-3)' }}>
          Nothing running for the selected year(s).
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
            <thead>
              <tr>
                <th style={thSt}>Programme</th>
                {years.map(y => <th key={y} style={{ ...thSt, textAlign: 'center' }}>Year {y}</th>)}
                <th style={{ ...thSt, textAlign: 'center' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map(r => (
                <tr key={r.program}>
                  <td style={{ ...tdSt, fontWeight: 700 }}>{r.program}</td>
                  {years.map(y => {
                    const n = r.years[y] || 0
                    return (
                      <td key={y} style={{ ...tdSt, textAlign: 'center' }}>
                        {n ? (
                          <button onClick={() => onCell({ wing: table.wing, group: table.group, program: r.program, year: y })}
                            title="Show courses and faculty"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 800, color, textDecoration: 'underline dotted', padding: '2px 6px' }}>
                            {n}
                          </button>
                        ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                    )
                  })}
                  <td style={{ ...tdSt, textAlign: 'center', fontWeight: 800 }}>{r.total}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdSt, fontWeight: 800, background: 'var(--surface-2)', borderTop: `2px solid ${color}` }}>Total</td>
                {years.map(y => (
                  <td key={y} style={{ ...tdSt, textAlign: 'center', fontWeight: 800, background: 'var(--surface-2)', borderTop: `2px solid ${color}` }}>
                    {colTotal(y) || '—'}
                  </td>
                ))}
                <td style={{ ...tdSt, textAlign: 'center', fontWeight: 800, background: 'var(--surface-2)', borderTop: `2px solid ${color}`, color }}>
                  {table.sections}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function YearRoomsTab() {
  const { get } = useApi()
  const [years, setYears]     = useState([2])
  const [days, setDays]       = useState([1])
  const [periods, setPeriods] = useState([])
  const [data, setData]       = useState(null)
  const [busy, setBusy]       = useState(false)
  const [cell, setCell]       = useState(null)
  const [roomView, setRoomView] = useState('free')
  const [showFaculty, setShowFaculty] = useState(false)

  const toggle = (list, set) => v => set(list.includes(v) ? list.filter(x => x !== v) : [...list, v].sort((a, b) => a - b))

  const run = async () => {
    if (!years.length)   return toast.error('Select at least one year')
    if (!days.length)    return toast.error('Select at least one day')
    if (!periods.length) return toast.error('Select at least one period')
    setBusy(true); setCell(null)
    try {
      const d = await get(`/api/free/year-rooms?years=${years.join(',')}&days=${days.join(',')}&periods=${periods.join(',')}`)
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setData(null); return toast.error(d.message) }
      setData(d)
      toast.success(`${d.totals.sections} sections · ${d.facultyTotals.count} faculty · ${d.totals.freeRooms} free rooms`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const slotLabel = data
    ? `Year ${data.years.join(', ')} · ${data.days.map(d => DAY_SHORT[d - 1]).join(', ')} · hour(s) ${data.periods.join(', ')}`
    : ''

  const cellKey = cell ? `${cell.wing}|${cell.group}|${cell.program}|${cell.year}` : null
  const cellList = cellKey ? (data?.cellClasses?.[cellKey] || []) : []

  const roomRows = useMemo(() => {
    if (!data) return []
    return Object.values(data.rooms.detail).flatMap(d => d[roomView] || [])
      .sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }))
  }, [data, roomView])

  const download = () => {
    if (!data) return toast.error('Run the analysis first')
    const wb = XLSX.utils.book_new()
    const add = (rows, name) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: `None — ${slotLabel}` }]), name.slice(0, 31))

    add([
      { Metric: 'Year(s)', Value: data.years.join(', ') },
      { Metric: 'Day(s)', Value: data.days.map(d => DAY_NAMES[d - 1]).join(', ') },
      { Metric: 'Period(s)', Value: data.periods.join(', ') },
      { Metric: 'Total sections', Value: data.totals.sections },
      { Metric: 'Total classes', Value: data.totals.classes },
      { Metric: 'Faculty in these slots', Value: data.facultyTotals.count },
      { Metric: 'Rooms used by selected year(s)', Value: data.totals.selectedRooms },
      { Metric: 'Rooms used by other years', Value: data.totals.otherRooms },
      { Metric: 'Free rooms', Value: data.totals.freeRooms },
      { Metric: 'Free seats', Value: data.totals.freeSeats },
      { Metric: 'Countable rooms', Value: data.rooms.masterTotal },
      { Metric: 'Room-wise TT', Value: data.sources.roomwise ? `${data.sources.roomwise.label} (${data.sources.roomwise.entries} rows)` : 'not uploaded' },
      { Metric: 'Faculty-wise TT', Value: data.sources.facultywise ? `${data.sources.facultywise.label} (${data.sources.facultywise.entries} rows)` : 'not uploaded' },
    ], 'Summary')

    for (const t of data.tables) {
      add(t.rows.map(r => {
        const o = { Programme: r.program }
        data.years.forEach(y => { o[`Year ${y}`] = r.years[y] || 0 })
        o.Total = r.total
        return o
      }), t.title.replace(/[^\w.& -]/g, ''))
    }

    const classRows = []
    for (const [key, list] of Object.entries(data.cellClasses)) {
      const [wing, group, program, year] = key.split('|')
      for (const c of list) classRows.push({
        Wing: wing, Group: group, Programme: program, Year: year,
        'Course Code': c.course_code || '', Type: c.component || '', Section: c.section || '',
        Rooms: (c.rooms || []).join(' | '),
        'Faculty ID': (c.faculty || []).map(f => f.uni_id).filter(Boolean).join(' | '),
        'Faculty Name': (c.faculty || []).map(f => f.faculty_name).filter(Boolean).join(' | '),
        Source: (c.sources || []).join(' + '),
      })
    }
    add(classRows, 'Classes')

    add(data.faculty.map(f => ({
      'Faculty ID': f.uni_id || '', 'Faculty Name': f.faculty_name || '',
      Campus: f.campus || '', 'Classes in slot': f.slotCount,
      Teaching: f.classes.map(c => `${c.program} Y${c.year} ${c.course_code || ''}-${c.component || ''} SEC:${c.section || ''} @${c.room || '?'}`).join(' | '),
    })), 'Faculty')

    for (const v of ROOM_VIEWS) {
      const rows = Object.values(data.rooms.detail).flatMap(d => d[v.key] || [])
        .sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }))
      add(rows.map(r => ({
        Room: r.room, Wing: r.wing, Allotment: r.allotment || '', Type: r.type || '',
        Capacity: r.capacity ?? '', Block: r.block || '', Floor: r.floor ?? '',
        'Allotted To': data.days.map(d => r.usage?.[d]).filter(Boolean).join(' | '),
        'Selected year(s) in room': (r.yearsSelected || []).join(', '),
        'Other year(s) in room': (r.yearsOther || []).join(', '),
      })), `Rooms ${v.key}`)
    }

    if (data.rooms.excluded?.length) add(data.rooms.excluded.map(r => ({
      Room: r.room, Reason: r.reason,
      Status: r.occupied ? 'In use this slot' : 'Not in use this slot',
      Wing: r.wing || '', Type: r.type || '', Capacity: r.capacity ?? '',
      'Name(s) in room timetable': (r.timetableNames || []).join(' | '),
    })), 'Excluded Rooms')

    XLSX.writeFile(wb, `year${data.years.join('-')}-rooms-${data.days.map(d => DAY_SHORT[d - 1]).join('')}-P${data.periods.join('')}.xlsx`)
  }

  const yearChoices = data?.yearsAvailable?.length ? data.yearsAvailable : ALL_YEARS

  return (
    <div>
      <p style={lSt}>STEP 1 — Pick year(s)</p>
      <Pills items={yearChoices} value={years} onToggle={toggle(years, setYears)} labelOf={y => `Year ${y}`} />

      <p style={lSt}>STEP 2 — Pick day(s)</p>
      <Pills items={[1, 2, 3, 4, 5, 6]} value={days} onToggle={toggle(days, setDays)} labelOf={d => DAY_SHORT[d - 1]} />

      <p style={lSt}>STEP 3 — Pick hour(s)</p>
      <PeriodPicker selected={periods} onChange={setPeriods} max={24} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? 'Analysing…' : 'Analyse'}
        </button>
        {data && <button className="btn btn-success" onClick={download}>📥 Export Excel</button>}
      </div>

      {data && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
            <strong style={{ color: 'var(--text-2)' }}>{slotLabel}</strong>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
            Sources —{' '}
            <span style={{ color: data.sources.roomwise ? '#10b981' : '#ef4444' }}>
              Room-wise TT: {data.sources.roomwise ? `${data.sources.roomwise.entries} rows` : 'not uploaded'}
            </span>
            {' · '}
            <span style={{ color: data.sources.facultywise ? '#10b981' : '#ef4444' }}>
              Faculty-wise TT: {data.sources.facultywise ? `${data.sources.facultywise.entries} rows` : 'not uploaded'}
            </span>
            {!data.sources.facultywise && ' — faculty names need this upload'}
            {data.unparsed > 0 && <span style={{ color: '#f59e0b' }}> · {data.unparsed} cell(s) unreadable</span>}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <Stat label="SECTIONS" value={data.totals.sections} sub={`${data.totals.classes} classes`} />
            <Stat label="FACULTY" value={data.facultyTotals.count} sub="teaching in these slots" color="#2563eb" />
            <Stat label="ROOMS — SELECTED" value={data.totals.selectedRooms} sub="used by these year(s)" color="#c9122a" />
            <Stat label="ROOMS — OTHER YEARS" value={data.totals.otherRooms} sub="not available" color="#f59e0b" />
            <Stat label="ROOMS FREE" value={data.totals.freeRooms} sub={`${data.totals.freeSeats.toLocaleString()} seats`} color="#10b981" />
          </div>

          <p style={lSt}>SECTIONS BY PROGRAMME — click a count for courses &amp; faculty</p>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 24 }}>
            {data.tables.map(t => (
              <GroupTable key={`${t.wing}|${t.group}`} table={t} years={data.years} onCell={setCell} />
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ ...lSt, margin: 0 }}>FACULTY IN THESE SLOTS — {data.facultyTotals.count}</p>
            <button className="btn btn-ghost" onClick={() => setShowFaculty(s => !s)} style={{ fontSize: 12 }}>
              {showFaculty ? 'Hide' : 'Show faculty list'}
            </button>
          </div>
          {showFaculty && (
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginTop: 8, marginBottom: 24, maxHeight: 420, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead>
                  <tr>
                    <th style={thSt}>Faculty ID</th>
                    <th style={thSt}>Name</th>
                    <th style={thSt}>Campus</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Classes</th>
                    <th style={thSt}>Teaching</th>
                  </tr>
                </thead>
                <tbody>
                  {data.faculty.length ? data.faculty.map(f => (
                    <tr key={f.uni_id || f.faculty_name}>
                      <td style={{ ...tdSt, fontFamily: 'monospace', fontWeight: 700 }}>{f.uni_id || '—'}</td>
                      <td style={tdSt}>{f.faculty_name || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>{f.campus || '—'}</td>
                      <td style={{ ...tdSt, textAlign: 'right' }}>{f.slotCount}</td>
                      <td style={{ ...tdSt, fontSize: 11 }}>
                        {f.classes.map((c, i) => (
                          <div key={i} style={{ whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.course_code || '?'}</span>
                            {' '}{c.component} · {c.program} Y{c.year} · SEC:{c.section} · {c.room || '?'}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} style={{ ...tdSt, color: 'var(--text-3)' }}>
                      No faculty identified — the Faculty-wise timetable supplies these names.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p style={{ ...lSt, marginTop: 8 }}>ROOMS</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {ROOM_VIEWS.map(v => {
              const n = v.key === 'selected' ? data.totals.selectedRooms
                : v.key === 'other' ? data.totals.otherRooms : data.totals.freeRooms
              const on = roomView === v.key
              return (
                <button key={v.key} onClick={() => setRoomView(v.key)} style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${on ? v.color : 'var(--border)'}`,
                  background: on ? v.color : 'transparent',
                  color: on ? '#fff' : 'var(--text-2)',
                }}>{v.label} ({n})</button>
              )
            })}
          </div>

          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 460 }}>
              <thead>
                <tr>
                  <th style={thSt}>Wing</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Selected</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Other years</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Free</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Free seats</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rooms.byWing.map(w => (
                  <tr key={w.wing}>
                    <td style={{ ...tdSt, fontWeight: 700, color: WING_COLOR[w.wing] }}>{w.wing}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>{w.selected}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>{w.other}</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{w.free}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>{w.freeSeats.toLocaleString()}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>{w.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 460, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={thSt}>Room</th>
                  <th style={thSt}>Type</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Capacity</th>
                  <th style={thSt}>Block</th>
                  <th style={thSt}>Wing</th>
                  <th style={thSt}>Allotted to</th>
                  <th style={thSt}>Year(s) in room</th>
                </tr>
              </thead>
              <tbody>
                {roomRows.length ? roomRows.map(r => (
                  <tr key={r.room}>
                    <td style={{ ...tdSt, fontWeight: 700, fontFamily: 'monospace' }}>{r.room}</td>
                    <td style={tdSt}>{r.type || '—'}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>{r.capacity ?? '—'}</td>
                    <td style={tdSt}>{r.block || '—'}</td>
                    <td style={tdSt}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: WING_COLOR[r.wing] }}>{r.wing}</span>
                      {r.allotment && r.allotment !== r.wing && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>({r.allotment})</span>
                      )}
                    </td>
                    <td style={{ ...tdSt, fontSize: 12 }}>
                      {data.days.map(d => r.usage?.[d]).filter(Boolean).join('  |  ') || '—'}
                    </td>
                    <td style={{ ...tdSt, fontSize: 12 }}>
                      {r.yearsSelected?.length ? <strong>Y{r.yearsSelected.join(', Y')}</strong> : null}
                      {r.yearsSelected?.length && r.yearsOther?.length ? ' · ' : null}
                      {r.yearsOther?.length ? <span style={{ color: 'var(--text-3)' }}>Y{r.yearsOther.join(', Y')}</span> : null}
                      {!r.yearsSelected?.length && !r.yearsOther?.length ? '—' : null}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} style={{ ...tdSt, color: 'var(--text-3)' }}>No rooms in this group.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {data.rooms.uncategorisedOccupied > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 12 }}>
              ⚠️ {data.rooms.uncategorisedOccupied} occupied room(s) are not counted — not in the room master,
              no recorded capacity, or a sports facility. All {data.rooms.excluded.length} excluded room(s) are
              itemised with their reason on the “Excluded Rooms” sheet of the Excel export.
            </div>
          )}
        </div>
      )}

      {cell && (
        <Modal
          title={`${cell.program} — Year ${cell.year}`}
          subtitle={`${cellList.length} course(s) · ${slotLabel}`}
          onClose={() => setCell(null)}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thSt}>Course</th>
                  <th style={thSt}>Type</th>
                  <th style={thSt}>Sec</th>
                  <th style={thSt}>Room(s)</th>
                  <th style={thSt}>Faculty</th>
                  <th style={thSt}>Source</th>
                </tr>
              </thead>
              <tbody>
                {cellList.map(c => (
                  <tr key={`${c.course_code}|${c.component}|${c.section}`}>
                    <td style={{ ...tdSt, fontWeight: 700, fontFamily: 'monospace' }}>{c.course_code || '—'}</td>
                    <td style={tdSt}>
                      <span style={{ fontWeight: 700 }}>{c.component}</span>
                      <span style={{ color: 'var(--text-3)', fontSize: 11, marginLeft: 5 }}>{COMPONENT_NAME[c.component]}</span>
                    </td>
                    <td style={tdSt}>{c.section || '—'}</td>
                    <td style={{ ...tdSt, fontSize: 12 }}>{c.rooms?.join(', ') || '—'}</td>
                    <td style={{ ...tdSt, fontSize: 11 }}>
                      {c.faculty?.length
                        ? c.faculty.map(f => (
                          <div key={f.uni_id || f.faculty_name} style={{ whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{f.uni_id || '?'}</span>
                            {' '}{f.faculty_name || ''}
                          </div>
                        ))
                        : <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                    <td style={{ ...tdSt, fontSize: 11, color: 'var(--text-3)' }}>{c.sources?.join(' + ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}
