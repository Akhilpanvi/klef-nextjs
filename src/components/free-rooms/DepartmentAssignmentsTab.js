'use client'
import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useApi } from '@/components/AuthContext'
import { ASSIGNMENT_DAYS, ASSIGNMENT_DAY_NAMES, assignmentExportColumns } from '@/lib/roomAssignmentFormat'

const cell = { padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontSize: 12 }

export default function DepartmentAssignmentsTab() {
  const { get } = useApi()
  const getRef = useRef(get)
  getRef.current = get
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')
  const [block, setBlock] = useState('')
  const [assigned, setAssigned] = useState('')
  const [coverage, setCoverage] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setData(null)
    getRef.current('/api/free/room-assignments').then(result => {
      if (!result.success) throw new Error(result.message || 'Unable to load assignments')
      if (active) setData(result)
    }).catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])

  const rooms = data?.rooms || []
  const blocks = [...new Set(rooms.map(room => room.block))].sort()
  const assignments = [...new Set(rooms.map(room => room.assigned).filter(Boolean))].sort()
  const query = search.trim().toLowerCase()
  const filtered = rooms.filter(room =>
    (!block || room.block === block) && (!assigned || room.assigned === assigned) &&
    (!coverage || (coverage === 'matched' ? room.has_assignment_data : !room.has_assignment_data)) &&
    (!query || [room.number, room.assigned, ...Object.values(room.day_assignments)].some(value => String(value || '').toLowerCase().includes(query))))
  const matched = rooms.filter(room => room.has_assignment_data).length

  const download = () => {
    const workbook = XLSX.utils.book_new()
    const rows = filtered.map(room => ({
      'Room No': room.number, Block: room.block, Type: room.type, Capacity: room.capacity,
      ...assignmentExportColumns(room), Source: data.source,
    }))
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Department Assignments')
    XLSX.writeFile(workbook, 'room-department-assignments.xlsx')
  }

  return <section aria-label="Department assignments">
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div><h3 style={{ margin: '0 0 8px' }}>Room Department Assignments</h3>
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Assigned use and Monday–Saturday department assignments for the approved rooms.</p></div>
      <button className="btn btn-primary" onClick={() => setReload(value => value + 1)} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
    </div>
    {loading && <p role="status">Loading assignments…</p>}
    {error && <p role="alert">{error}</p>}
    {data && <>
      <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Source: {data.source} · {matched} of {rooms.length} approved rooms matched · {rooms.length - matched} without a matching assignment record.</p>
      <p style={{ fontSize: 13 }}>Assignments describe planned use. Free-room availability is calculated from the uploaded timetable. Blank or unmatched assignments are shown as “Not specified”.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '16px 0' }}>
        <input className="input" aria-label="Search room or department" placeholder="Search room or department…" value={search} onChange={event => setSearch(event.target.value)} style={{ flex: '1 1 230px' }} />
        <select className="input" aria-label="Assignment block" value={block} onChange={event => setBlock(event.target.value)} style={{ width: 170 }}>
          <option value="">All blocks</option>{blocks.map(value => <option key={value}>{value}</option>)}
        </select>
        <select className="input" aria-label="Assigned use" value={assigned} onChange={event => setAssigned(event.target.value)} style={{ width: 220 }}>
          <option value="">All assigned uses</option>{assignments.map(value => <option key={value}>{value}</option>)}
        </select>
        <select className="input" aria-label="Assignment coverage" value={coverage} onChange={event => setCoverage(event.target.value)} style={{ width: 200 }}>
          <option value="">All approved rooms</option><option value="matched">With assignment records</option><option value="missing">Without matching records</option>
        </select>
        <button className="btn btn-success" onClick={download} disabled={!filtered.length}>Export Excel</button>
      </div>
      <p style={{ fontWeight: 700 }}>{filtered.length} rooms</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse' }}>
          <thead><tr>{['Room', 'Block', 'Assigned', ...ASSIGNMENT_DAY_NAMES].map(label => <th key={label} scope="col" style={{ ...cell, background: 'var(--surface-2)' }}>{label}</th>)}</tr></thead>
          <tbody>{filtered.map(room => <tr key={room.number}>
            <th scope="row" style={cell}>{room.number}</th><td style={cell}>{room.block}</td><td style={cell}>{room.assigned || 'Not specified'}</td>
            {ASSIGNMENT_DAYS.map(day => <td key={day} style={cell}>{room.day_assignments[day] || 'Not specified'}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      {!filtered.length && <p role="status">No rooms match these filters.</p>}
    </>}
  </section>
}
