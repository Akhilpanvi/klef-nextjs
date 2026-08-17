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

/**
 * Two independent questions, so two independent filters.
 *  status       - who touches the room anywhere in the selection
 *  availability - how much of the selection it is actually free for
 * A room used by year 3 on Monday is status "selected" yet may still be
 * partly free for 44 of 66 slots, which is the number worth acting on.
 */
const ROOM_VIEWS = [
  { key: 'all',        kind: 'all',   label: 'All rooms',                        color: 'var(--text-2)' },
  { key: 'exclusive',  kind: 'excl',  label: 'Single use — only selected year(s)', color: '#059669' },
  { key: 'shared',     kind: 'excl',  label: 'Multi use — shared with other years', color: '#f59e0b' },
  { key: 'othersOnly', kind: 'excl',  label: 'Only other years',                 color: '#a855f7' },
  { key: 'fullyFree',  kind: 'avail', label: 'Free in every slot',               color: '#10b981' },
  { key: 'partlyFree', kind: 'avail', label: 'Free in some slots',               color: '#0ea5e9' },
  { key: 'fullyBusy',  kind: 'avail', label: 'Busy in every slot',               color: '#ef4444' },
]
const viewMatch = (r, key) => {
  const v = ROOM_VIEWS.find(x => x.key === key)
  if (!v || v.kind === 'all') return true
  if (v.kind === 'excl')  return r.exclusivity === key
  if (v.kind === 'avail') return r.availability === key
  return r.status === key
}

const EXCL_LABEL = {
  exclusive:  'Single use (only selected years)',
  shared:     'Multi use (shared with other years)',
  othersOnly: 'Only other years',
  unused:     'Not used at all',
}
const AVAIL_LABEL = { fullyFree: 'Free every slot', partlyFree: 'Free some slots', fullyBusy: 'Busy every slot' }


/** Day x hour grid of who occupies a room; blank means genuinely free. */
function SlotGrid({ room, days, periods }) {
  const byKey = new Map((room.slots || []).map(s => [`${s.d}-${s.h}`, s]))
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ ...thSt, padding: '4px 6px' }}>Day</th>
            {periods.map(h => <th key={h} style={{ ...thSt, padding: '4px 6px', textAlign: 'center' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {days.map(d => (
            <tr key={d}>
              <td style={{ ...tdSt, padding: '4px 6px', fontWeight: 700 }}>{DAY_SHORT[d - 1]}</td>
              {periods.map(h => {
                const cell = byKey.get(`${d}-${h}`)
                const sel = cell?.sel?.length ? cell.sel.join('/') : ''
                const oth = cell?.oth?.length ? cell.oth.join('/') : ''
                const txt = [sel, oth].filter(Boolean).join('+')
                return (
                  <td key={h} title={cell ? `Year ${txt}` : 'free'} style={{
                    ...tdSt, padding: '4px 6px', textAlign: 'center', fontWeight: 700,
                    background: !cell ? 'rgba(16,185,129,.12)' : sel ? 'rgba(201,18,42,.14)' : 'rgba(245,158,11,.14)',
                    color: !cell ? '#10b981' : sel ? '#c9122a' : '#b45309',
                  }}>{txt || '·'}</td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
        Numbers are the year occupying that hour. Green = free · red = a selected year · amber = another year.
      </div>
    </div>
  )
}

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

function Stat({ label, value, sub, color, onClick }) {
  return (
    <button className="card" onClick={onClick} title="Click for the full list" style={{
      padding: 14, minWidth: 150, flex: '1 1 150px', cursor: 'pointer',
      textAlign: 'left', border: '1px solid var(--border)', background: 'var(--surface)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: color || 'var(--text-3)', letterSpacing: '.04em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--text)', lineHeight: 1, textDecoration: 'underline dotted' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
    </button>
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
  const [roomView, setRoomView] = useState('partlyFree')
  const [showFaculty, setShowFaculty] = useState(false)
  const [detail, setDetail] = useState(null)   // 'sections' | 'faculty' | 'rooms'
  const [gridRoom, setGridRoom] = useState(null)

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

  // room -> full details, so a room mentioned anywhere can show its wing and
  // what it is allotted to without a second lookup.
  const roomById = useMemo(() => {
    const m = new Map()
    if (!data) return m
    for (const r of data.rooms.list || []) m.set(r.room, r)
    return m
  }, [data])

  const allClasses = useMemo(() => {
    if (!data) return []
    const out = []
    for (const [key, list] of Object.entries(data.cellClasses)) {
      const [wing, group, program, year] = key.split('|')
      for (const c of list) out.push({ wing, group, program, year: +year, ...c })
    }
    return out.sort((a, b) =>
      a.program.localeCompare(b.program) || a.year - b.year ||
      String(a.course_code).localeCompare(String(b.course_code)))
  }, [data])

  const roomMeta = r => roomById.get(r) || null
  const allottedTo = r => {
    const m = roomMeta(r)
    if (!m || !data) return ''
    return data.days.map(d => m.usage?.[d]).filter(Boolean).join(' | ')
  }

  const roomRows = useMemo(() => {
    if (!data) return []
    return (data.rooms.list || []).filter(r => viewMatch(r, roomView))
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
      { Metric: 'Faculty with FD details matched', Value: data.facultyTotals.fdMatched },
      { Metric: 'Faculty missing an FD row', Value: data.facultyTotals.fdMissing },
      { Metric: 'Faculty over permissible load', Value: data.facultyTotals.overloaded },
      { Metric: 'Slots per room in this selection', Value: data.totals.slotsPerRoom },
      { Metric: 'Single use — only selected year(s)', Value: data.totals.exclusiveRooms },
      { Metric: 'Single use seats', Value: data.totals.exclusiveSeats },
      { Metric: 'Multi use — shared with other years', Value: data.totals.sharedRooms },
      { Metric: 'Rooms touched by selected year(s)', Value: data.totals.selectedRooms },
      { Metric: 'Rooms used by other years only', Value: data.totals.otherRooms },
      { Metric: 'Free in every slot', Value: data.totals.fullyFree },
      { Metric: 'Free in some slots', Value: data.totals.partlyFree },
      { Metric: 'Busy in every slot', Value: data.totals.fullyBusy },
      { Metric: 'Free seats (rooms free every slot)', Value: data.totals.freeSeats },
      { Metric: 'Total free room-hours', Value: data.totals.freeSlotTotal },
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
        'Room Wing': (c.rooms || []).map(r => roomMeta(r)?.wing || '?').join(' | '),
        'Room Allotment': (c.rooms || []).map(r => roomMeta(r)?.allotment || '?').join(' | '),
        'Room Allotted To': (c.rooms || []).map(r => allottedTo(r) || '-').join(' | '),
        'Room Type': (c.rooms || []).map(r => roomMeta(r)?.type || '?').join(' | '),
        'Room Capacity': (c.rooms || []).map(r => roomMeta(r)?.capacity ?? '?').join(' | '),
        'Faculty ID': (c.faculty || []).map(f => f.uni_id).filter(Boolean).join(' | '),
        'Faculty Name': (c.faculty || []).map(f => f.faculty_name).filter(Boolean).join(' | '),
      })
    }
    add(classRows, 'Classes')

    // Faculty sheet carries the FD details and the measured load, so the year's
    // work can be reviewed from the workbook alone.
    add(data.faculty.map(f => ({
      'Faculty ID':   f.uni_id || '',
      'Faculty Name': f.faculty_name || f.fd?.name || '',
      'Dept (DPET)':  f.fd?.dept || '',
      Designation:    f.fd?.designation || '',
      'Category (R/Ac/Ad)': f.fd?.category || '',
      'Assigned Responsibility': f.fd?.responsibility || '',
      Cohort:        f.fd?.cohort || '',
      'Cohort Name': f.fd?.cohort_name || '',
      'Contact Number': f.fd?.phone || '',
      'Email ID':       f.fd?.email || '',
      Campus:           f.campus || '',
      'Designation Load': f.fd?.designationLoad ?? '',
      'Permissible Load': f.fd?.permissibleLoad ?? '',
      'Actual Weekly Load (hrs)': f.workload?.weekLoad ?? '',
      'Load vs Permissible':      f.workload?.vsPermissible ?? '',
      'Utilisation %':            f.workload?.utilisationPct ?? '',
      'Courses (week)': f.workload?.weekCourses ?? '',
      'Rooms (week)':   f.workload?.weekRooms ?? '',
      'Days (week)':    f.workload?.weekDays ?? '',
      'Classes in selected slot': f.slotCount,
      Teaching: f.classes.map(c => `${c.program} Y${c.year} ${c.course_code || ''}-${c.component || ''} SEC:${c.section || ''} @${c.room || '?'}`).join(' | '),
      'Rooms used': [...new Set(f.classes.map(c => c.room).filter(Boolean))].join(' | '),
      'Room Wing': [...new Set(f.classes.map(c => roomMeta(c.room)?.wing).filter(Boolean))].join(' | '),
      'Room Allotted To': [...new Set(f.classes.map(c => allottedTo(c.room)).filter(Boolean))].join(' | '),
      'FD record': f.fd ? 'matched' : 'no FD row for this Emp No',
    })), 'Faculty')

    // Every countable room on one sheet with a Status column, so it can be
    // filtered or pivoted in Excel rather than split across three tabs.
    const roomRow = r => ({
      Room: r.room,
      Use: EXCL_LABEL[r.exclusivity] || r.exclusivity,
      Availability: AVAIL_LABEL[r.availability] || r.availability,
      'Allocated Wing': r.wing,
      'Allocated To (category)': r.allotment || '',
      'Allotted To (Room Allocation)': allottedTo(r.room) || '',
      Type: r.type || '', Capacity: r.capacity ?? '',
      Block: r.block || '', Floor: r.floor ?? '',
      'Selected year(s) in room': (r.yearsSelected || []).join(', '),
      'Other year(s) in room': (r.yearsOther || []).join(', '),
      'Busy slots': r.busySlots, 'Free slots': r.freeSlots, 'Slots in selection': r.totalSlots,
      'Busy when': (r.slots || [])
        .map(sl => `${DAY_SHORT[sl.d - 1]}${sl.h}:${[...(sl.sel || []), ...(sl.oth || [])].join('/')}`)
        .join(' '),
      'Free when': (() => {
        const busy = new Set((r.slots || []).map(sl => `${sl.d}-${sl.h}`))
        const out = []
        for (const d of data.days) for (const h of data.periods)
          if (!busy.has(`${d}-${h}`)) out.push(`${DAY_SHORT[d - 1]}${h}`)
        return out.join(' ')
      })(),
    })

    const allRooms = [...roomById.values()]
      .sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }))

    // Every room, then the two that matter for reassignment on their own sheets.
    add(allRooms.map(roomRow), 'Rooms')
    add(allRooms.filter(r => r.exclusivity === 'exclusive').map(roomRow), 'Rooms Single Use')
    add(allRooms.filter(r => r.exclusivity === 'shared').map(roomRow), 'Rooms Multi Use')

    // One row per room per busy slot, so the grid can be pivoted in Excel.
    const gridRows = []
    for (const r of allRooms) {
      for (const sl of r.slots || []) gridRows.push({
        Room: r.room, Wing: r.wing, Use: EXCL_LABEL[r.exclusivity] || '',
        Day: DAY_NAMES[sl.d - 1], Period: sl.h,
        'Selected year(s)': (sl.sel || []).join(', '),
        'Other year(s)': (sl.oth || []).join(', '),
        Capacity: r.capacity ?? '',
        'Allotted To (Room Allocation)': allottedTo(r.room) || '',
      })
    }
    add(gridRows, 'Room Slot Grid')

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
          {(!data.sources.facultywise || data.unparsed > 0) && (
            <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 14 }}>
              {!data.sources.facultywise && 'Faculty-wise timetable not uploaded — faculty names and load are unavailable. '}
              {data.unparsed > 0 && `${data.unparsed} cell(s) unreadable.`}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <Stat label="SECTIONS" value={data.totals.sections} sub={`${data.totals.classes} classes`}
              onClick={() => setDetail('sections')} />
            <Stat label="FACULTY" value={data.facultyTotals.count} sub="teaching in these slots" color="#2563eb"
              onClick={() => setDetail('faculty')} />
            <Stat label="SINGLE USE" value={data.totals.exclusiveRooms}
              sub={`only these year(s) · ${data.totals.exclusiveSeats.toLocaleString()} seats`} color="#059669"
              onClick={() => { setRoomView('exclusive'); setDetail('rooms') }} />
            <Stat label="MULTI USE" value={data.totals.sharedRooms} sub="shared with other years" color="#f59e0b"
              onClick={() => { setRoomView('shared'); setDetail('rooms') }} />
            <Stat label="FREE EVERY SLOT" value={data.totals.fullyFree} sub={`${data.totals.freeSeats.toLocaleString()} seats · all ${data.totals.slotsPerRoom} slots`} color="#10b981"
              onClick={() => { setRoomView('fullyFree'); setDetail('rooms') }} />
            <Stat label="FREE SOME SLOTS" value={data.totals.partlyFree} sub={`${data.totals.freeSlotTotal.toLocaleString()} free room-hours`} color="#0ea5e9"
              onClick={() => { setRoomView('partlyFree'); setDetail('rooms') }} />
          </div>

          <p style={lSt}>SECTIONS BY PROGRAMME — click a count for courses &amp; faculty</p>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 24 }}>
            {data.tables.map(t => (
              <GroupTable key={`${t.wing}|${t.group}`} table={t} years={data.years} onCell={setCell} />
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ ...lSt, margin: 0 }}>
              FACULTY IN THESE SLOTS — {data.facultyTotals.count}
              {data.facultyTotals.fdMissing > 0 && (
                <span style={{ fontWeight: 400, color: '#f59e0b', letterSpacing: 0, textTransform: 'none' }}>
                  {' '}· {data.facultyTotals.fdMissing} without an FD record
                </span>
              )}
              {data.facultyTotals.overloaded > 0 && (
                <span style={{ fontWeight: 400, color: '#ef4444', letterSpacing: 0, textTransform: 'none' }}>
                  {' '}· {data.facultyTotals.overloaded} over permissible load
                </span>
              )}
            </p>
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
                    <th style={thSt}>Dept</th>
                    <th style={thSt}>Designation</th>
                    <th style={thSt}>Responsibility</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Load / PL</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Classes</th>
                    <th style={thSt}>Teaching</th>
                  </tr>
                </thead>
                <tbody>
                  {data.faculty.length ? data.faculty.map(f => (
                    <tr key={f.uni_id || f.faculty_name}>
                      <td style={{ ...tdSt, fontFamily: 'monospace', fontWeight: 700 }}>{f.uni_id || '—'}</td>
                      <td style={tdSt}>{f.faculty_name || f.fd?.name || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>{f.fd?.dept || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>{f.fd?.designation || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>{f.fd?.responsibility || '—'}</td>
                      <td style={{ ...tdSt, textAlign: 'right', fontSize: 12 }}>
                        {f.workload?.weekLoad ?? '—'}
                        <span style={{ color: 'var(--text-3)' }}> / {f.fd?.permissibleLoad ?? '—'}</span>
                        {f.workload?.vsPermissible > 0 && (
                          <span style={{ color: '#ef4444', fontWeight: 700 }}> +{f.workload.vsPermissible}</span>
                        )}
                      </td>
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
                    <tr><td colSpan={8} style={{ ...tdSt, color: 'var(--text-3)' }}>
                      No faculty identified — the Faculty-wise timetable supplies these names.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p style={{ ...lSt, marginTop: 8 }}>ROOMS</p>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
            Each room is measured across all {data.totals.slotsPerRoom} selected slots
            ({data.days.length} day(s) × {data.periods.length} hour(s)). A room can be used by a
            selected year in one hour and still be free in others — the Free / Busy slot counts
            below say which, and the grid shows exactly when.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {ROOM_VIEWS.map(v => {
              const n = (data.rooms.list || []).filter(r => viewMatch(r, v.key)).length
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
                  <th style={{ ...thSt, textAlign: 'right' }}>Single use</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Multi use</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Only other yrs</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Free every slot</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Free some slots</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Busy every slot</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Free room-hours</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rooms.byWing.map(w => (
                  <tr key={w.wing}>
                    <td style={{ ...tdSt, fontWeight: 700, color: WING_COLOR[w.wing] }}>{w.wing}</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontWeight: 700, color: '#059669' }}>{w.exclusive}</td>
                    <td style={{ ...tdSt, textAlign: 'right', color: '#f59e0b' }}>{w.shared}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>{w.other}</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{w.fullyFree}</td>
                    <td style={{ ...tdSt, textAlign: 'right', color: '#0ea5e9' }}>{w.partlyFree}</td>
                    <td style={{ ...tdSt, textAlign: 'right', color: '#ef4444' }}>{w.fullyBusy}</td>
                    <td style={{ ...tdSt, textAlign: 'right' }}>{w.freeSlots.toLocaleString()}</td>
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
                  <th style={thSt}>Use</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Busy / Free slots</th>
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
                    <td style={{ ...tdSt, fontSize: 11 }}>
                      <span style={{ fontWeight: 700, color: r.exclusivity === 'exclusive' ? '#059669' : r.exclusivity === 'shared' ? '#f59e0b' : 'var(--text-3)' }}>
                        {r.exclusivity === 'exclusive' ? 'Single' : r.exclusivity === 'shared' ? 'Multi' : r.exclusivity === 'othersOnly' ? 'Others' : 'Unused'}
                      </span>
                    </td>
                    <td style={{ ...tdSt, textAlign: 'right', fontSize: 12 }}>
                      {r.busySlots} / <span style={{ color: '#10b981', fontWeight: 700 }}>{r.freeSlots}</span>
                    </td>
                    <td style={{ ...tdSt, fontSize: 12 }}>
                      {r.yearsSelected?.length ? <strong>Y{r.yearsSelected.join(', Y')}</strong> : null}
                      {r.yearsSelected?.length && r.yearsOther?.length ? ' · ' : null}
                      {r.yearsOther?.length ? <span style={{ color: 'var(--text-3)' }}>Y{r.yearsOther.join(', Y')}</span> : null}
                      {!r.yearsSelected?.length && !r.yearsOther?.length ? '—' : null}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={9} style={{ ...tdSt, color: 'var(--text-3)' }}>No rooms in this group.</td></tr>
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

      {detail && (
        <Modal
          title={
            detail === 'sections' ? `All sections — ${data.totals.sections} across ${data.totals.classes} classes`
            : detail === 'faculty' ? `Faculty in these slots — ${data.facultyTotals.count}`
            : `${ROOM_VIEWS.find(v => v.key === roomView)?.label} — ${roomRows.length} room(s)`
          }
          subtitle={slotLabel}
          onClose={() => { setDetail(null); setGridRoom(null) }}
        >
          {detail === 'sections' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thSt}>Programme</th>
                    <th style={{ ...thSt, textAlign: 'center' }}>Yr</th>
                    <th style={thSt}>Course</th>
                    <th style={thSt}>Type</th>
                    <th style={thSt}>Sec</th>
                    <th style={thSt}>Room</th>
                    <th style={thSt}>Wing</th>
                    <th style={thSt}>Allotted to</th>
                    <th style={thSt}>Faculty</th>
                  </tr>
                </thead>
                <tbody>
                  {allClasses.map((c, i) => (
                    <tr key={i}>
                      <td style={{ ...tdSt, fontWeight: 700, fontSize: 12 }}>{c.program}</td>
                      <td style={{ ...tdSt, textAlign: 'center' }}>{c.year}</td>
                      <td style={{ ...tdSt, fontFamily: 'monospace', fontSize: 12 }}>{c.course_code || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>{c.component || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>{c.section || '—'}</td>
                      <td style={{ ...tdSt, fontFamily: 'monospace', fontSize: 12 }}>{c.rooms?.join(', ') || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>
                        {(c.rooms || []).map(r => roomMeta(r)?.wing).filter(Boolean).map((w, j) => (
                          <span key={j} style={{ color: WING_COLOR[w], fontWeight: 700 }}>{w} </span>
                        ))}
                        {!(c.rooms || []).length && '—'}
                      </td>
                      <td style={{ ...tdSt, fontSize: 11 }}>
                        {(c.rooms || []).map(r => allottedTo(r)).filter(Boolean).join(' | ') || '—'}
                      </td>
                      <td style={{ ...tdSt, fontSize: 11 }}>
                        {c.faculty?.length
                          ? c.faculty.map(f => `${f.uni_id || '?'} ${f.faculty_name || ''}`).join(', ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {detail === 'faculty' && (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
                {data.facultyTotals.fdMatched} matched to an FD record
                {data.facultyTotals.fdMissing > 0 && ` · ${data.facultyTotals.fdMissing} without one`}
                {data.facultyTotals.overloaded > 0 && ` · ${data.facultyTotals.overloaded} over permissible load`}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thSt}>ID</th>
                    <th style={thSt}>Name</th>
                    <th style={thSt}>Dept</th>
                    <th style={thSt}>Designation</th>
                    <th style={thSt}>Responsibility</th>
                    <th style={thSt}>Cohort</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Load / PL</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Util%</th>
                    <th style={thSt}>Rooms used</th>
                  </tr>
                </thead>
                <tbody>
                  {data.faculty.map(f => (
                    <tr key={f.uni_id || f.faculty_name}>
                      <td style={{ ...tdSt, fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{f.uni_id || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>{f.faculty_name || f.fd?.name || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>{f.fd?.dept || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 11 }}>{f.fd?.designation || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 11 }}>{f.fd?.responsibility || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 11 }}>{f.fd?.cohort || '—'}</td>
                      <td style={{ ...tdSt, textAlign: 'right', fontSize: 12 }}>
                        {f.workload?.weekLoad ?? '—'}<span style={{ color: 'var(--text-3)' }}> / {f.fd?.permissibleLoad ?? '—'}</span>
                      </td>
                      <td style={{ ...tdSt, textAlign: 'right', fontSize: 12,
                        color: f.workload?.utilisationPct > 100 ? '#ef4444' : 'var(--text)' }}>
                        {f.workload?.utilisationPct != null ? `${f.workload.utilisationPct}%` : '—'}
                      </td>
                      <td style={{ ...tdSt, fontSize: 11, fontFamily: 'monospace' }}>
                        {[...new Set(f.classes.map(c => c.room).filter(Boolean))].join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {detail === 'rooms' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thSt}>Room</th>
                    <th style={thSt}>Allocated wing</th>
                    <th style={thSt}>Allotted to</th>
                    <th style={thSt}>Type</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Cap</th>
                    <th style={thSt}>Use</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Busy / Free</th>
                    <th style={thSt}>Year(s) in room</th>
                    <th style={thSt}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {roomRows.map(r => (
                    <tr key={r.room}>
                      <td style={{ ...tdSt, fontWeight: 700, fontFamily: 'monospace' }}>{r.room}</td>
                      <td style={tdSt}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: WING_COLOR[r.wing] }}>{r.wing}</span>
                        {r.allotment && r.allotment !== r.wing && (
                          <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>({r.allotment})</span>
                        )}
                      </td>
                      <td style={{ ...tdSt, fontSize: 11 }}>{allottedTo(r.room) || '—'}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>{r.type || '—'}</td>
                      <td style={{ ...tdSt, textAlign: 'right' }}>{r.capacity ?? '—'}</td>
                      <td style={{ ...tdSt, fontSize: 11, fontWeight: 700,
                        color: r.exclusivity === 'exclusive' ? '#059669' : r.exclusivity === 'shared' ? '#f59e0b' : 'var(--text-3)' }}>
                        {r.exclusivity === 'exclusive' ? 'Single' : r.exclusivity === 'shared' ? 'Multi' : r.exclusivity === 'othersOnly' ? 'Others' : 'Unused'}
                      </td>
                      <td style={{ ...tdSt, textAlign: 'right', fontSize: 12 }}>
                        {r.busySlots} / <span style={{ color: '#10b981', fontWeight: 700 }}>{r.freeSlots}</span>
                      </td>
                      <td style={{ ...tdSt, fontSize: 12 }}>
                        {r.yearsSelected?.length ? <strong>Y{r.yearsSelected.join(', Y')}</strong> : null}
                        {r.yearsSelected?.length && r.yearsOther?.length ? ' · ' : null}
                        {r.yearsOther?.length ? <span style={{ color: 'var(--text-3)' }}>Y{r.yearsOther.join(', Y')}</span> : null}
                        {!r.yearsSelected?.length && !r.yearsOther?.length ? '—' : null}
                      </td>
                      <td style={tdSt}>
                        <button onClick={() => setGridRoom(gridRoom === r.room ? null : r.room)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontSize: 11, textDecoration: 'underline dotted', padding: 0 }}>
                          {gridRoom === r.room ? 'hide' : 'grid'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!roomRows.length && (
                    <tr><td colSpan={9} style={{ ...tdSt, color: 'var(--text-3)' }}>No rooms in this group.</td></tr>
                  )}
                </tbody>
              </table>
              {gridRoom && roomById.get(gridRoom) && (
                <div style={{ marginTop: 14, padding: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
                    {gridRoom} — busy {roomById.get(gridRoom).busySlots} of {roomById.get(gridRoom).totalSlots} slots
                  </div>
                  <SlotGrid room={roomById.get(gridRoom)} days={data.days} periods={data.periods} />
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)' }}>
                Total capacity: {roomRows.reduce((t, r) => t + (r.capacity || 0), 0).toLocaleString()} seats ·
                {' '}{roomRows.reduce((t, r) => t + r.freeSlots, 0).toLocaleString()} free room-hours in this group
              </div>
            </div>
          )}
        </Modal>
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
