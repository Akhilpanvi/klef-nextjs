'use client'
import { useState } from 'react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { useApi } from '@/components/AuthContext'
import { COMPONENT_NAME, DAY_NAMES } from '@/lib/roomLabel'

const DAY_SHORT  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WING_COLOR = { COE: '#c9122a', MHS: '#2563eb', FED: '#059669' }

const lSt  = { fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em', margin: '0 0 8px' }
const thSt = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', borderBottom: '2px solid var(--border)', background: 'var(--surface-2)', whiteSpace: 'nowrap', textAlign: 'left' }
const tdSt = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid var(--border)' }

/** The four buckets, in the order they matter for planning. */
const BUCKETS = [
  { key: 'reclaimable', color: '#059669', label: 'Reclaimable',
    blurb: 'This year’s own rooms, idle in this slot and nobody else in them — take these first.' },
  { key: 'free', color: '#10b981', label: 'Free',
    blurb: 'Not used by anyone in this slot.' },
  { key: 'thisYear', color: '#c9122a', label: 'Used by this year',
    blurb: 'This year is teaching in these right now.' },
  { key: 'otherYears', color: '#f59e0b', label: 'Used by other years',
    blurb: 'Occupied by a different year, so not available.' },
]

function Tile({ b, count, seats, active, onClick }) {
  return (
    <button onClick={onClick} className="card" style={{
      padding: 14, minWidth: 168, flex: '1 1 168px', cursor: 'pointer', textAlign: 'left',
      border: `1.5px solid ${active ? b.color : 'var(--border)'}`,
      background: active ? 'var(--surface-2)' : undefined,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: b.color, letterSpacing: '.04em', marginBottom: 6 }}>
        {b.label.toUpperCase()}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: b.color, lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
        rooms{seats != null ? ` · ${seats.toLocaleString()} seats` : ''}
      </div>
    </button>
  )
}

function RoomTable({ rows, days, showClasses, showYears }) {
  if (!rows.length) return (
    <div style={{ padding: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-3)' }}>
      No rooms in this group.
    </div>
  )
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
        <thead>
          <tr>
            <th style={thSt}>Room</th>
            <th style={thSt}>Type</th>
            <th style={{ ...thSt, textAlign: 'right' }}>Capacity</th>
            <th style={thSt}>Block</th>
            <th style={thSt}>Wing</th>
            <th style={thSt}>Allotted to</th>
            {showYears && <th style={thSt}>Year(s)</th>}
            {showClasses && <th style={thSt}>Classes in this slot</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.room}>
              <td style={{ ...tdSt, fontWeight: 700, fontFamily: 'monospace' }}>{r.room}</td>
              <td style={tdSt}>{r.type || '—'}</td>
              <td style={{ ...tdSt, textAlign: 'right' }}>{r.capacity ?? '—'}</td>
              <td style={tdSt}>{r.block || '—'}</td>
              <td style={tdSt}>
                <span style={{ fontWeight: 700, fontSize: 12, color: WING_COLOR[r.wing] || 'var(--text-2)' }}>{r.wing}</span>
                {r.allotment && r.allotment !== r.wing && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>({r.allotment})</span>
                )}
              </td>
              <td style={{ ...tdSt, fontSize: 12 }}>
                {days.map(d => r.usage?.[d]).filter(Boolean).join('  |  ') || '—'}
              </td>
              {showYears && (
                <td style={{ ...tdSt, fontSize: 12 }}>{r.years?.length ? r.years.join(', ') : '—'}</td>
              )}
              {showClasses && (
                <td style={{ ...tdSt, fontSize: 11 }}>
                  {r.classes?.length
                    ? r.classes.map(c => (
                      <div key={`${c.year}${c.course_code}${c.component}${c.section}`} style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.course_code}</span>
                        {' '}<span title={COMPONENT_NAME[c.component]}>{c.component}</span>
                        {' · '}{c.program} Y{c.year} · SEC:{c.section}
                      </div>
                    ))
                    : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function YearRoomsTab() {
  const { get } = useApi()
  const [year, setYear]       = useState(2)
  const [days, setDays]       = useState([1])
  const [periods, setPeriods] = useState([])
  const [data, setData]       = useState(null)
  const [busy, setBusy]       = useState(false)
  const [view, setView]       = useState('reclaimable')

  const toggleDay = d => setDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort())

  const run = async () => {
    if (!days.length)    return toast.error('Select at least one day')
    if (!periods.length) return toast.error('Select at least one period')
    setBusy(true)
    try {
      const d = await get(`/api/free/year-rooms?year=${year}&days=${days.join(',')}&periods=${periods.join(',')}`)
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setData(null); return toast.error(d.message) }
      setData(d); setView('reclaimable')
      toast.success(`Year ${d.year}: ${d.totals.reclaimable} reclaimable, ${d.totals.free} free`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const slotLabel = data
    ? `Year ${data.year} · ${data.days.map(d => DAY_SHORT[d - 1]).join(', ')} · hour(s) ${data.periods.join(', ')}`
    : ''

  const download = () => {
    if (!data) return toast.error('Run the analysis first')
    const wb = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Metric: 'Year', Value: data.year },
      { Metric: 'Day(s)', Value: data.days.map(d => DAY_NAMES[d - 1]).join(', ') },
      { Metric: 'Period(s)', Value: data.periods.join(', ') },
      { Metric: 'Reclaimable rooms', Value: data.totals.reclaimable },
      { Metric: 'Reclaimable seats', Value: data.totals.seatsReclaimable },
      { Metric: 'Free rooms', Value: data.totals.free },
      { Metric: 'Free seats', Value: data.totals.seatsFree },
      { Metric: 'Used by this year', Value: data.totals.thisYear },
      { Metric: 'Used by other years', Value: data.totals.otherYears },
      { Metric: 'Countable rooms', Value: data.totals.master },
      { Metric: `Rooms year ${data.year} uses all week`, Value: data.totals.yearWeekRooms },
      { Metric: 'Room timetable', Value: data.snapshot },
    ]), 'Summary')

    for (const b of BUCKETS) {
      const rows = (data.buckets[b.key] || []).map(r => ({
        Room: r.room, Type: r.type || '', Capacity: r.capacity ?? '',
        Block: r.block || '', Floor: r.floor ?? '', Wing: r.wing,
        Allotment: r.allotment || '',
        'Allotted To': data.days.map(d => r.usage?.[d]).filter(Boolean).join(' | '),
        'Year(s) in slot': (r.years || []).join(', '),
        'Classes in slot': (r.classes || [])
          .map(c => `${c.program} Y${c.year} ${c.course_code}-${c.component} SEC:${c.section}`).join(' | '),
      }))
      if (!rows.length) rows.push({ Room: `None — ${slotLabel}` })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), b.label.slice(0, 31))
    }

    const excluded = data.rooms?.excluded || []
    if (excluded.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      excluded.map(r => ({
        Room: r.room, Reason: r.reason,
        Status: r.occupied ? 'In use this slot' : 'Not in use this slot',
        Wing: r.wing || '', Type: r.type || '', Capacity: r.capacity ?? '',
        'Name(s) in room timetable': (r.timetableNames || []).join(' | '),
      }))), 'Excluded Rooms')

    XLSX.writeFile(wb, `year${data.year}-rooms-${data.days.map(d => DAY_SHORT[d - 1]).join('')}-P${data.periods.join('')}.xlsx`)
  }

  const years = data?.yearsAvailable?.length ? data.yearsAvailable : [1, 2, 3, 4, 5]
  const active = BUCKETS.find(b => b.key === view) || BUCKETS[0]
  const rows   = data?.buckets?.[view] || []

  return (
    <div>
      <p style={lSt}>STEP 1 — Pick the year</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {years.map(y => (
          <button key={y} onClick={() => setYear(y)} style={{
            padding: '6px 16px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${year === y ? 'var(--brand)' : 'var(--border)'}`,
            background: year === y ? 'var(--brand)' : 'transparent',
            color: year === y ? '#fff' : 'var(--text-2)', transition: 'all .15s',
          }}>Year {y}</button>
        ))}
      </div>

      <p style={lSt}>STEP 2 — Pick day(s)</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {DAY_SHORT.map((d, i) => {
          const on = days.includes(i + 1)
          return (
            <button key={d} onClick={() => toggleDay(i + 1)} title={DAY_NAMES[i]} style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
              background: on ? 'var(--brand)' : 'transparent',
              color: on ? '#fff' : 'var(--text-2)', transition: 'all .15s',
            }}>{d}</button>
          )
        })}
      </div>

      <p style={lSt}>STEP 3 — Pick hour(s)</p>
      <PeriodPicker selected={periods} onChange={setPeriods} max={24} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? 'Analysing…' : 'Analyse Year'}
        </button>
        {data && <button className="btn btn-success" onClick={download}>📥 Export Excel</button>}
      </div>

      {data && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
            <strong style={{ color: 'var(--text-2)' }}>{slotLabel}</strong>
            {' — '}{data.totals.master} countable rooms · Year {data.year} uses{' '}
            {data.totals.yearWeekRooms} rooms across the week · source: {data.snapshot}
            {data.unparsed > 0 && <span style={{ color: '#f59e0b' }}> · {data.unparsed} label(s) unreadable</span>}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            {BUCKETS.map(b => (
              <Tile key={b.key} b={b}
                count={data.totals[b.key]}
                seats={b.key === 'reclaimable' ? data.totals.seatsReclaimable
                  : b.key === 'free' ? data.totals.seatsFree : null}
                active={view === b.key}
                onClick={() => setView(b.key)} />
            ))}
          </div>

          <div style={{ overflowX: 'auto', marginBottom: 20 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 420 }}>
              <thead>
                <tr>
                  <th style={thSt}>Wing</th>
                  {BUCKETS.map(b => <th key={b.key} style={{ ...thSt, textAlign: 'right' }}>{b.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.perWing).map(([wing, v]) => (
                  <tr key={wing}>
                    <td style={{ ...tdSt, fontWeight: 700, color: WING_COLOR[wing] }}>{wing}</td>
                    {BUCKETS.map(b => (
                      <td key={b.key} style={{ ...tdSt, textAlign: 'right' }}>{v[b.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ ...lSt, margin: '0 0 4px' }}>{active.label.toUpperCase()} — {rows.length} ROOM(S)</p>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>{active.blurb}</div>
          <RoomTable
            rows={rows}
            days={data.days}
            showYears={view === 'otherYears'}
            showClasses={view === 'thisYear' || view === 'otherYears'}
          />

          {data.rooms.uncategorisedOccupied > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 12 }}>
              ⚠️ {data.rooms.uncategorisedOccupied} occupied room(s) are not counted — not in the room master,
              no recorded capacity, or a sports facility. All {data.rooms.excluded.length} excluded room(s) are
              itemised with their reason on the “Excluded Rooms” sheet of the Excel export.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
