'use client'
import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { ASSIGNMENT_DAYS, assignmentExportColumns } from '@/lib/roomAssignmentFormat'
import { useApi } from '@/components/AuthContext'

const periods = Array.from({ length: 11 }, (_, index) => index + 1)
const percent = value => value == null ? 'No data' : `${value}%`
const th = { padding: '10px 8px', textAlign: 'center', fontSize: 12, whiteSpace: 'nowrap', background: 'var(--surface-2)', borderBottom: '2px solid var(--border)' }
const td = { padding: 6, textAlign: 'center', borderBottom: '1px solid var(--border)' }
const heat = value => value == null ? 'var(--surface-2)' : value >= 75 ? 'rgba(239,68,68,.18)' : value >= 40 ? 'rgba(245,158,11,.18)' : 'rgba(16,185,129,.15)'

export default function BlockUtilizationTab() {
  const { get } = useApi()
  const getRef = useRef(get)
  getRef.current = get
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [block, setBlock] = useState('')
  const [selected, setSelected] = useState(null)
  const [reload, setReload] = useState(0)
  const detailRef = useRef(null)

  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setSelected(null); setData(null)
    getRef.current('/api/free/block-utilization').then(result => {
      if (!result.success) throw new Error(result.message || 'Unable to load room utilization')
      if (active) setData(result)
    }).catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])

  useEffect(() => { if (selected) detailRef.current?.focus() }, [selected])

  const visible = (data?.blocks || []).filter(item => !block || item.block === block)
  const totals = visible.reduce((sum, item) => ({
    roomCount: sum.roomCount + item.roomCount, coveredRooms: sum.coveredRooms + item.coveredRooms,
    occupiedSlots: sum.occupiedSlots + item.occupiedSlots, totalSlots: sum.totalSlots + item.totalSlots,
  }), { roomCount: 0, coveredRooms: 0, occupiedSlots: 0, totalSlots: 0 })
  const weekly = totals.totalSlots ? Math.round(totals.occupiedSlots / totals.totalSlots * 1000) / 10 : null

  const download = () => {
    const workbook = XLSX.utils.book_new()
    const addSheet = (rows, name) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name)
    addSheet(visible.map(item => ({
      Block: item.block, 'Approved rooms': item.roomCount, 'Rooms with timetable data': item.coveredRooms,
      'Rooms without data': item.missingRooms.length, 'Occupied room-periods': item.occupiedSlots,
      'Free room-periods': item.freeSlots, 'Total room-periods': item.totalSlots,
      'Utilization (%)': item.utilization ?? 'No data', 'Source file': data.filename || data.snapshotLabel,
    })), 'Block Summary')
    addSheet(visible.flatMap(item => item.days.flatMap(day => day.periods.map(slot => ({
      Block: item.block, Day: day.name, Period: slot.hour, 'Covered rooms': item.coveredRooms,
      'Occupied rooms': slot.occupied, 'Free rooms': slot.free, 'Utilization (%)': slot.utilization ?? 'No data',
      'Occupied room numbers': slot.occupiedRooms.join(', '), 'Free room numbers': slot.freeRooms.join(', '),
    })))), 'Day and Period')
    const missing = visible.flatMap(item => item.missingRooms.map(room => ({ Block: item.block, Room: room, Status: 'No timetable data' })))
    if (missing.length) addSheet(missing, 'Rooms without data')
    const visibleBlocks = new Set(visible.map(item => item.block))
    const assignments = Object.values(data.roomAssignments || {}).filter(room => visibleBlocks.has(room.block))
    if (assignments.length) addSheet(assignments.map(room => ({ Room: room.number, Block: room.block, ...assignmentExportColumns(room) })), 'Department Assignments')
    XLSX.writeFile(workbook, 'block-room-utilization-Mon-Sat-P1-11.xlsx')
  }

  return (
    <section aria-label="Block-wise room utilization">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: '0 0 6px' }}>Block-wise Room Utilization</h3>
          <p style={{ color: 'var(--text-3)', margin: '0 0 12px', fontSize: 13 }}>Monday–Saturday · Periods 1–11 · Approved rooms only</p>
        </div>
        <button className="btn btn-primary" disabled={loading} onClick={() => setReload(value => value + 1)}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {loading && <p role="status">Loading block utilization…</p>}
      {error && <p role="alert" style={{ color: 'var(--brand)' }}>{error}</p>}
      {data?.noData && <p role="status">{data.message}</p>}
      {data && !data.noData && !loading && <>
        <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
          Source: {data.filename || data.snapshotLabel || 'Uploaded roomwise timetable'}
          {data.uploadedAt && <> · Uploaded {new Date(data.uploadedAt).toLocaleString()}</>}
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <label htmlFor="utilization-block">Block</label>
          <select id="utilization-block" className="input" value={block} onChange={event => { setBlock(event.target.value); setSelected(null) }} style={{ width: 200 }}>
            <option value="">All blocks</option>
            {data.blocks.map(item => <option key={item.block} value={item.block}>Block {item.block}</option>)}
          </select>
          <button className="btn btn-success" onClick={download} disabled={!visible.length}>Export Excel</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
          {[
            ['Approved rooms', totals.roomCount], ['Rooms with timetable data', totals.coveredRooms],
            ['Rooms without data', totals.roomCount - totals.coveredRooms], ['Weekly utilization', percent(weekly)],
          ].map(([label, value]) => <div key={label} className="card" style={{ padding: 16 }}>
            <div style={{ color: 'var(--text-3)', fontSize: 12 }}>{label}</div>
            <div style={{ fontSize: 25, fontWeight: 800, marginTop: 6 }}>{value}</div>
          </div>)}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          Utilization = occupied rooms ÷ rooms with timetable data. Each cell shows occupied / covered rooms and the percentage.
          Click a cell to see occupied and free room numbers. Weekly utilization uses 66 periods per covered room.
          Rooms absent from the uploaded timetable are marked “No data” and excluded from free-room counts and percentages.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Color scale: green below 40% · amber 40–74.9% · red 75–100%.</p>
        {selected && <div ref={detailRef} tabIndex={-1} className="card" style={{ padding: 18, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <h4 style={{ margin: '0 0 12px' }}>Block {selected.block} · {selected.day} · Period {selected.hour}</h4>
            <button className="btn" onClick={() => setSelected(null)} aria-label="Close room details">Close</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
            <div><strong>Occupied ({selected.occupied})</strong><AssignmentList rooms={selected.occupiedRooms} day={selected.dayNumber} assignments={data.roomAssignments} /></div>
            <div><strong>Free ({selected.free})</strong><AssignmentList rooms={selected.freeRooms} day={selected.dayNumber} assignments={data.roomAssignments} /></div>
          </div>
        </div>}
        {visible.map(item => <article key={item.block} className="card" style={{ padding: 16, marginBottom: 20, minWidth: 0 }}>
          <h4 style={{ margin: '0 0 8px' }}>Block {item.block} · {percent(item.utilization)} weekly utilization</h4>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-3)' }}>
            {item.coveredRooms} of {item.roomCount} approved rooms have timetable data · {item.occupiedSlots} occupied / {item.totalSlots} room-periods
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <caption style={{ textAlign: 'left', fontSize: 12, paddingBottom: 8 }}>Block {item.block}: occupied rooms / covered rooms</caption>
              <thead><tr><th scope="col" style={th}>Day</th>{periods.map(hour => <th key={hour} scope="col" style={th}>P{hour}</th>)}<th scope="col" style={th}>Daily %</th></tr></thead>
              <tbody>{item.days.map(day => <tr key={day.day}>
                <th scope="row" style={{ ...td, textAlign: 'left', fontSize: 12 }}>{day.name}</th>
                {day.periods.map(slot => <td key={slot.hour} style={td}>
                  <button disabled={!item.coveredRooms}
                    onClick={() => setSelected({ ...slot, block: item.block, day: day.name, dayNumber: day.day })}
                    aria-label={`Block ${item.block}, ${day.name}, period ${slot.hour}: ${slot.occupied} occupied, ${slot.free} free, ${percent(slot.utilization)}`}
                    style={{ width: '100%', padding: '10px 4px', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--text)', background: heat(slot.utilization), cursor: item.coveredRooms ? 'pointer' : 'default' }}>
                    {item.coveredRooms ? <><strong>{slot.occupied}/{item.coveredRooms}</strong><br /><span style={{ fontSize: 11 }}>{percent(slot.utilization)}</span></> : <span style={{ fontSize: 11 }}>No data</span>}
                  </button>
                </td>)}
                <td style={{ ...td, fontWeight: 700, fontSize: 12 }}>{percent(day.utilization)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {!!item.missingRooms.length && <details style={{ marginTop: 12, fontSize: 12 }}>
            <summary style={{ cursor: 'pointer' }}>{item.missingRooms.length} approved rooms without timetable data</summary>
            <p style={{ overflowWrap: 'anywhere', color: 'var(--text-3)' }}>{item.missingRooms.join(', ')}</p>
          </details>}
        </article>)}
      </>}
    </section>
  )
}

function AssignmentList({ rooms, day, assignments = {} }) {
  if (!rooms.length) return <p>None</p>
  return <ul style={{ paddingLeft: 18, lineHeight: 1.7, overflowWrap: 'anywhere' }}>
    {rooms.map(room => <li key={room}>
      <strong>{room}</strong> ? Assigned: {assignments[room]?.assigned || 'Not specified'}
      <br />Day assignment: {assignments[room]?.day_assignments?.[ASSIGNMENT_DAYS[day - 1]] || 'Not specified'}
    </li>)}
  </ul>
}
