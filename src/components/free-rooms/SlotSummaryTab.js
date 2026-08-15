'use client'
import { useState, useMemo } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { useApi } from '@/components/AuthContext'
import { COMPONENT_NAME, DAY_NAMES } from '@/lib/roomLabel'

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WING_COLOR = { COE: '#c9122a', MHS: '#2563eb', FED: '#059669' }

const lSt  = { fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em', margin: '0 0 8px' }
const thSt = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', borderBottom: '2px solid var(--border)', background: 'var(--surface-2)', whiteSpace: 'nowrap' }
const tdSt = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid var(--border)' }

function Modal({ title, subtitle, onClose, children, wide }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="card fade-up" style={{ width: '100%', maxWidth: wide ? 860 : 680, padding: 24, maxHeight: '85vh', overflowY: 'auto' }}>
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

// ── Occupied / Free tile per wing (both numbers clickable) ──────────────────
function WingTile({ stat, onPick }) {
  const pct   = stat.total ? Math.round((stat.occupied / stat.total) * 100) : 0
  const color = WING_COLOR[stat.wing] || 'var(--text-2)'
  const numSt = c => ({ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 22, fontWeight: 800, color: c, lineHeight: 1, padding: 0, textDecoration: 'underline dotted' })
  return (
    <div className="card" style={{ padding: 14, minWidth: 170, flex: '1 1 170px' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: '.05em', marginBottom: 8 }}>{stat.wing}</div>
      <div style={{ display: 'flex', gap: 18, marginBottom: 8 }}>
        <div>
          <button style={numSt('#ef4444')} onClick={() => onPick(stat.wing, 'occupied')} title="Show occupied rooms">{stat.occupied}</button>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>OCCUPIED</div>
        </div>
        <div>
          <button style={numSt('#10b981')} onClick={() => onPick(stat.wing, 'free')} title="Show free rooms">{stat.free}</button>
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

// ── Programme × Year pivot ──────────────────────────────────────────────────
function PivotTable({ table, years, onCell }) {
  const color = WING_COLOR[table.wing] || 'var(--brand)'
  const colTotal = y => table.rows.reduce((s, r) => s + (r.years[y] || 0), 0)
  return (
    <div style={{ flex: '1 1 400px', minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color, marginBottom: 8 }}>{table.title}</div>
      {!table.rows.length ? (
        <div style={{ padding: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-3)' }}>
          Nothing running in this slot.
        </div>
      ) : (
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
              {table.rows.map(r => (
                <tr key={r.program}>
                  <td style={{ ...tdSt, fontWeight: 700 }}>{r.program}</td>
                  {years.map(y => {
                    const n = r.years[y] || 0
                    return (
                      <td key={y} style={{ ...tdSt, textAlign: 'center' }}>
                        {n ? (
                          <button
                            onClick={() => onCell({ wing: table.wing, sub: table.sub, program: r.program, year: y })}
                            title="Show courses running"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 800, color, textDecoration: 'underline dotted', padding: '2px 6px' }}
                          >{n}</button>
                        ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                    )
                  })}
                  <td style={{ ...tdSt, textAlign: 'center', fontWeight: 800 }}>{r.total}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdSt, fontWeight: 800, background: 'var(--surface-2)' }}>All sections</td>
                {years.map(y => <td key={y} style={{ ...tdSt, textAlign: 'center', fontWeight: 800, background: 'var(--surface-2)' }}>{colTotal(y)}</td>)}
                <td style={{ ...tdSt, textAlign: 'center', fontWeight: 800, background: 'var(--surface-2)' }}>
                  {table.rows.reduce((s, r) => s + r.total, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab ─────────────────────────────────────────────────────────────────────
export default function SlotSummaryTab() {
  const { get } = useApi()
  const [days, setDays]       = useState([1])
  const [periods, setPeriods] = useState([])
  const [data, setData]       = useState(null)
  const [busy, setBusy]       = useState(false)
  const [cell, setCell]       = useState(null)
  const [roomView, setRoomView] = useState(null)   // { wing, kind }

  const toggleDay = d => setDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort())

  const run = async () => {
    if (!days.length)    return toast.error('Select at least one day')
    if (!periods.length) return toast.error('Select at least one period')
    setBusy(true); setCell(null); setRoomView(null)
    try {
      const d = await get(`/api/free/slot-summary?days=${days.join(',')}&periods=${periods.join(',')}`)
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setData(null); return toast.error(d.message) }
      setData(d)
      const n = d.tables.reduce((s, t) => s + t.rows.length, 0)
      toast.success(n ? `${n} programme rows across ${d.days.length} day(s)` : 'Nothing scheduled')
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const years = useMemo(() => {
    if (!data) return [1, 2, 3, 4]
    const s = new Set()
    for (const t of data.tables) for (const r of t.rows) Object.keys(r.years).forEach(y => s.add(+y))
    return s.size ? [...s].sort((a, b) => a - b) : [1, 2, 3, 4]
  }, [data])

  const slotLabel = data
    ? `${data.days.map(d => DAY_SHORT[d - 1]).join(', ')} · hour(s) ${data.periods.join(', ')}`
    : ''

  const download = () => {
    if (!data) return toast.error('Run the analysis first')
    const wb = XLSX.utils.book_new()

    for (const t of data.tables) {
      const rows = t.rows.map(r => {
        const o = { Programme: r.program }
        years.forEach(y => { o[`Year ${y}`] = r.years[y] || 0 })
        o.Total = r.total
        return o
      })
      if (!rows.length) rows.push({ Programme: `No sections — ${slotLabel}` })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `${t.wing}-${t.sub}`.slice(0, 31))
    }

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.rooms.byWing.map(s => ({
        Wing: s.wing, 'Total Rooms': s.total, Occupied: s.occupied, Free: s.free,
        'Occupied %': s.total ? Math.round((s.occupied / s.total) * 100) : 0,
      })).concat([{ Wing: 'Occupied (not in room master)', 'Total Rooms': '', Occupied: data.rooms.uncategorisedOccupied, Free: '', 'Occupied %': '' }])
    ), 'Rooms Summary')

    const roomRows = []
    for (const [wing, d] of Object.entries(data.rooms.detail))
      for (const kind of ['occupied', 'free'])
        for (const r of d[kind]) roomRows.push({
          Wing: wing, Status: kind === 'occupied' ? 'Occupied' : 'Free', Room: r.room,
          Type: r.type || '', Capacity: r.capacity ?? '', Block: r.block || '', Floor: r.floor ?? '',
          'Allotted To': data.days.map(dn => r.usage?.[dn]).filter(Boolean).join(' | '),
          Notes: r.notes || '',
        })
    if (roomRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(roomRows), 'Room Detail')

    const detail = []
    for (const [key, list] of Object.entries(data.courses)) {
      const [wing, sub, program, year] = key.split('|')
      for (const c of list) detail.push({
        Wing: wing, Group: sub, Programme: program, Year: year,
        'Course Code': c.course_code, Type: c.component, Section: c.section,
        Rooms: c.rooms.join(' | '),
        Days: c.days.map(d => DAY_SHORT[d - 1]).join(','), Hours: c.hours.join(','),
        Label: c.label,
      })
    }
    if (detail.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Course Detail')

    XLSX.writeFile(wb, `slot-summary-${data.days.map(d => DAY_SHORT[d - 1]).join('')}-P${data.periods.join('')}.xlsx`)
  }

  const cellCourses = cell ? (data?.courses[`${cell.wing}|${cell.sub}|${cell.program}|${cell.year}`] || []) : []
  const roomList    = roomView ? (data?.rooms.detail[roomView.wing]?.[roomView.kind] || []) : []

  return (
    <div>
      <p style={lSt}>STEP 1 — Pick day(s)</p>
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
        <button onClick={() => setDays(days.length === 6 ? [] : [1, 2, 3, 4, 5, 6])}
          className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 12px' }}>
          {days.length === 6 ? 'Clear' : 'All week'}
        </button>
      </div>

      <p style={lSt}>STEP 2 — Pick hour(s)</p>
      <PeriodPicker selected={periods} onChange={setPeriods} max={24} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
        <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Analysing…' : 'Analyse Slot'}</button>
        {data && <button className="btn btn-success" onClick={download}>📥 Export Excel</button>}
      </div>

      {data && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
            <strong style={{ color: 'var(--text-2)' }}>{slotLabel}</strong>
            {' — '}{data.entryCount} room-timetable rows · source: {data.snapshot}
            {data.unparsed > 0 && <span style={{ color: '#f59e0b' }}> · {data.unparsed} label(s) unreadable</span>}
          </div>

          <p style={lSt}>ROOMS OCCUPIED vs FREE — click a number for the room list</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            {data.rooms.byWing.map(s => (
              <WingTile key={s.wing} stat={s} onPick={(wing, kind) => setRoomView({ wing, kind })} />
            ))}
          </div>
          {data.rooms.uncategorisedOccupied > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>
              ⚠️ {data.rooms.uncategorisedOccupied} occupied room(s) are not in the room master, so they are
              excluded above. Free figures cover the {data.rooms.masterTotal} known rooms only.
            </div>
          )}

          <p style={{ ...lSt, marginTop: 20 }}>SECTIONS RUNNING — click a count to see the courses</p>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {data.tables.map(t => (
              <PivotTable key={`${t.wing}|${t.sub}`} table={t} years={years} onCell={setCell} />
            ))}
          </div>
        </div>
      )}

      {cell && (
        <Modal
          title={`${cell.program} — Year ${cell.year}`}
          subtitle={`${cellCourses.length} course${cellCourses.length === 1 ? '' : 's'} · ${slotLabel}`}
          onClose={() => setCell(null)}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thSt, textAlign: 'left' }}>Course</th>
                  <th style={{ ...thSt, textAlign: 'left' }}>Type</th>
                  <th style={{ ...thSt, textAlign: 'left' }}>Sec</th>
                  <th style={{ ...thSt, textAlign: 'left' }}>Room(s)</th>
                  {data.days.length > 1 && <th style={{ ...thSt, textAlign: 'left' }}>Day(s)</th>}
                </tr>
              </thead>
              <tbody>
                {cellCourses.map(c => (
                  <tr key={`${c.course_code}|${c.component}|${c.section}`}>
                    <td style={{ ...tdSt, fontWeight: 700, fontFamily: 'monospace' }}>{c.course_code}</td>
                    <td style={tdSt}>
                      <span style={{ fontWeight: 700 }}>{c.component}</span>
                      <span style={{ color: 'var(--text-3)', fontSize: 11, marginLeft: 5 }}>{COMPONENT_NAME[c.component]}</span>
                    </td>
                    <td style={tdSt}>{c.section}</td>
                    <td style={{ ...tdSt, fontSize: 12 }}>{c.rooms.join(', ') || '—'}</td>
                    {data.days.length > 1 && (
                      <td style={{ ...tdSt, fontSize: 12 }}>{c.days.map(d => DAY_SHORT[d - 1]).join(', ')}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {roomView && (
        <Modal
          wide
          title={`${roomView.wing} — ${roomView.kind === 'occupied' ? 'Occupied' : 'Free'} rooms`}
          subtitle={`${roomList.length} room${roomList.length === 1 ? '' : 's'} · ${slotLabel}`}
          onClose={() => setRoomView(null)}
        >
          {!roomList.length ? (
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No rooms in this bucket.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thSt, textAlign: 'left' }}>Room</th>
                    <th style={{ ...thSt, textAlign: 'left' }}>Type</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Capacity</th>
                    <th style={{ ...thSt, textAlign: 'left' }}>Block</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Floor</th>
                    <th style={{ ...thSt, textAlign: 'left' }}>Allotted to (Room Allocation)</th>
                  </tr>
                </thead>
                <tbody>
                  {roomList.map(r => (
                    <tr key={r.room}>
                      <td style={{ ...tdSt, fontWeight: 700, fontFamily: 'monospace' }}>{r.room}</td>
                      <td style={tdSt}>{r.type || '—'}</td>
                      <td style={{ ...tdSt, textAlign: 'right' }}>{r.capacity ?? '—'}</td>
                      <td style={tdSt}>{r.block || '—'}</td>
                      <td style={{ ...tdSt, textAlign: 'right' }}>{r.floor ?? '—'}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>
                        {data.days.map(d => r.usage?.[d]).filter(Boolean).join('  |  ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-3)' }}>
                Total capacity shown: {roomList.reduce((s, r) => s + (r.capacity || 0), 0).toLocaleString()} seats
                across {roomList.filter(r => r.capacity).length} room(s) with a recorded capacity.
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
