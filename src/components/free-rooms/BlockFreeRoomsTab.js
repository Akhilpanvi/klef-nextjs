'use client'
import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useApi } from '@/components/AuthContext'
import { ASSIGNMENT_DAYS } from '@/lib/roomAssignmentFormat'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HOURS = Array.from({ length: 11 }, (_, index) => index + 1)
const cell = { padding: '9px 11px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontSize: 12 }
const byRoom = (a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })

export default function BlockFreeRoomsTab() {
  const { get } = useApi()
  const getRef = useRef(get)
  getRef.current = get
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [day, setDay] = useState('1')
  const [hour, setHour] = useState('1')
  const [block, setBlock] = useState('')
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    getRef.current('/api/free/block-utilization').then(result => {
      if (!result.success) throw new Error(result.message || 'Unable to load block-wise free rooms')
      if (active) setData(result)
    }).catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])

  const assignmentDay = ASSIGNMENT_DAYS[Number(day) - 1]
  const query = search.trim().toLowerCase()
  const allTypes = [...new Set(Object.values(data?.roomAssignments || {})
    .map(room => room.type).filter(value => value && value !== '?'))].sort()
  const groups = (data?.blocks || []).filter(item => !block || item.block === block).map(item => {
    const dayData = item.days.find(value => value.day === Number(day))
    const slot = dayData?.periods.find(value => value.hour === Number(hour))
    const rooms = (slot?.freeRooms || []).map(number => data.roomAssignments?.[number] || {
      number, block: item.block,
    }).filter(room => (!type || room.type === type) &&
      (!query || [room.number, room.type, room.assigned, room.day_assignments?.[assignmentDay]]
        .some(value => String(value || '').toLowerCase().includes(query))))
      .sort(byRoom)
    return { block: item.block, rooms, occupied: slot?.occupied || 0, available: slot?.free || 0 }
  }).filter(item => !query && !type || item.rooms.length)
  const rooms = groups.flatMap(group => group.rooms)
  const totalCapacity = rooms.reduce((sum, room) => sum + (Number(room.capacity) || 0), 0)

  const download = () => {
    const rows = groups.flatMap(group => group.rooms.map(room => ({
      Day: DAYS[Number(day) - 1], Period: Number(hour), Block: group.block,
      Floor: room.floor ?? '', 'Room No': room.number, Type: room.type || '',
      Capacity: room.capacity ?? '', Assigned: room.assigned || '',
      'Day Assignment': room.day_assignments?.[assignmentDay] || '',
    })))
    if (!rows.length) return
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Block Free Rooms')
    XLSX.writeFile(workbook, `block-free-rooms-${DAYS[Number(day) - 1]}-P${hour}.xlsx`)
  }

  return <section aria-label="Day and hour block-wise free rooms">
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h3 style={{ margin: '0 0 6px' }}>Block-wise Free Rooms</h3>
        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>Select a day and period to see free rooms grouped by block.</p>
      </div>
      <button className="btn btn-primary" disabled={loading} onClick={() => setReload(value => value + 1)}>{loading ? 'Loading...' : 'Refresh'}</button>
    </div>
    {loading && <p role="status">Loading block-wise free rooms...</p>}
    {error && <p role="alert" style={{ color: 'var(--brand)' }}>{error}</p>}
    {data?.noData && <p role="status">{data.message}</p>}
    {data && !data.noData && !loading && <>
      <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
        Timetable: {data.filename || data.snapshotLabel || 'Roomwise timetable'} · Room details: {data.assignmentSource}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16 }}>
        <select className="input" aria-label="Day" value={day} onChange={event => setDay(event.target.value)} style={{ width: 170 }}>
          {DAYS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
        </select>
        <select className="input" aria-label="Period" value={hour} onChange={event => setHour(event.target.value)} style={{ width: 130 }}>
          {HOURS.map(value => <option key={value} value={value}>Period {value}</option>)}
        </select>
        <select className="input" aria-label="Block" value={block} onChange={event => setBlock(event.target.value)} style={{ width: 170 }}>
          <option value="">All blocks</option>{data.blocks.map(item => <option key={item.block} value={item.block}>Block {item.block}</option>)}
        </select>
        <select className="input" aria-label="Room type" value={type} onChange={event => setType(event.target.value)} style={{ width: 170 }}>
          <option value="">All room types</option>{allTypes.map(value => <option key={value}>{value}</option>)}
        </select>
        <input className="input" aria-label="Search free rooms" placeholder="Search room or assignment..." value={search} onChange={event => setSearch(event.target.value)} style={{ flex: '1 1 220px' }} />
        <button className="btn btn-success" disabled={!rooms.length} onClick={download}>Export Excel</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 18 }}>
        {[["Free rooms", rooms.length], ["Blocks", groups.filter(group => group.rooms.length).length], ["Total capacity", totalCapacity]].map(([label, value]) =>
          <div key={label} className="card" style={{ padding: 16 }}><div style={{ color: 'var(--text-3)', fontSize: 12 }}>{label}</div><div style={{ fontSize: 25, fontWeight: 800, marginTop: 5 }}>{value}</div></div>)}
      </div>
      {!rooms.length && <p role="status">No free rooms match the selected day, period, block, and filters.</p>}
      {groups.map(group => <article key={group.block} className="card" style={{ padding: 16, marginBottom: 18 }}>
        <h4 style={{ margin: '0 0 5px' }}>Block {group.block} · {group.rooms.length} free rooms</h4>
        <p style={{ margin: '0 0 12px', color: 'var(--text-3)', fontSize: 12 }}>{group.occupied} occupied · {group.available} free before filters</p>
        {group.rooms.length ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 850, borderCollapse: 'collapse' }}>
          <thead><tr>{['Room', 'Floor', 'Type', 'Capacity', 'Assigned', `${DAYS[Number(day) - 1]} Assignment`].map(label =>
            <th key={label} scope="col" style={{ ...cell, background: 'var(--surface-2)' }}>{label}</th>)}</tr></thead>
          <tbody>{group.rooms.map(room => <tr key={room.number}>
            <th scope="row" style={cell}>{room.number}</th>
            <td style={cell}>{room.floor ?? '?'}</td><td style={cell}>{room.type || '?'}</td>
            <td style={cell}>{room.capacity ?? '?'}</td><td style={cell}>{room.assigned || 'Not specified'}</td>
            <td style={cell}>{room.day_assignments?.[assignmentDay] || 'Not specified'}</td>
          </tr>)}</tbody>
        </table></div> : <p style={{ color: 'var(--text-3)', fontSize: 13 }}>No matching free rooms in this block.</p>}
      </article>)}
    </>}
  </section>
}
