'use client'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { useApi } from '@/components/AuthContext'
import PeriodPicker from '@/components/ui/PeriodPicker'
import RoomDataWarning from '@/components/free-rooms/RoomDataWarning'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const th = { padding: '9px 10px', textAlign: 'left', fontSize: 11, background: 'var(--surface-2)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }
const td = { padding: '9px 10px', fontSize: 12, borderBottom: '1px solid var(--border)' }
const pct = (value, total) => total ? Math.round(value / total * 1000) / 10 : null
const showPct = value => value == null ? 'No capacity data' : `${value}%`

export default function CapacityOccupancyTab() {
  const { get } = useApi()
  const [day, setDay] = useState('1')
  const [periods, setPeriods] = useState([])
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [block, setBlock] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [capacity, setCapacity] = useState('')
  const [search, setSearch] = useState('')

  const check = async () => {
    if (!periods.length) return toast.error('Select at least one period')
    setBusy(true); setData(null)
    try {
      const result = await get(`/api/free/capacity-occupancy?day=${day}&periods=${periods.join(',')}`)
      if (!result.success) throw new Error(result.message || 'Unable to load capacity occupancy')
      setData(result)
      setBlock(''); setType(''); setStatus(''); setCapacity(''); setSearch('')
      if (!result.noData) toast.success(`${result.totals.occupiedRooms} occupied and ${result.totals.freeRooms} free rooms`)
    } catch (error) { toast.error(error.message) }
    finally { setBusy(false) }
  }

  const rooms = data?.rooms || []
  const blocks = [...new Set(rooms.map(room => room.block).filter(Boolean))].sort()
  const types = [...new Set(rooms.map(room => room.type).filter(value => value && value !== '?'))].sort()
  const capacities = [...new Set(rooms.map(room => room.capacity).filter(value => value != null))].sort((a, b) => a - b)
  const query = search.trim().toLowerCase()
  const filtered = rooms.filter(room => (!block || room.block === block) && (!type || room.type === type) &&
    (!status || room.status === status) && (!capacity || String(room.capacity) === capacity) &&
    (!query || [room.number, room.block, room.type, room.assigned, room.assigned_for_day]
      .some(value => String(value || '').toLowerCase().includes(query))))
  const known = filtered.filter(room => room.capacity != null)
  const occupied = filtered.filter(room => room.status === 'occupied')
  const free = filtered.filter(room => room.status === 'free')
  const totalCapacity = known.reduce((sum, room) => sum + room.capacity, 0)
  const occupiedCapacity = occupied.reduce((sum, room) => sum + (room.capacity || 0), 0)
  const freeCapacity = free.reduce((sum, room) => sum + (room.capacity || 0), 0)

  const capacityGroups = [...new Set(filtered.map(room => room.capacity ?? 'Unknown'))].map(value => {
    const list = filtered.filter(room => (room.capacity ?? 'Unknown') === value)
    const occupiedList = list.filter(room => room.status === 'occupied')
    const freeList = list.filter(room => room.status === 'free')
    const seats = list.reduce((sum, room) => sum + (room.capacity || 0), 0)
    const occupiedSeats = occupiedList.reduce((sum, room) => sum + (room.capacity || 0), 0)
    return { capacity: value, rooms: list.length, occupied: occupiedList.length, free: freeList.length,
      seats, occupiedSeats, freeSeats: seats - occupiedSeats, occupancy: pct(occupiedSeats, seats) }
  }).sort((a, b) => a.capacity === 'Unknown' ? 1 : b.capacity === 'Unknown' ? -1 : a.capacity - b.capacity)

  const download = () => {
    if (!filtered.length) return toast.error('Nothing to export')
    const workbook = XLSX.utils.book_new()
    const summary = capacityGroups.map(group => ({
      Capacity: group.capacity, Rooms: group.rooms, 'Occupied rooms': group.occupied, 'Free rooms': group.free,
      'Total seats': group.seats, 'Occupied seats': group.occupiedSeats, 'Free seats': group.freeSeats,
      'Seat occupancy (%)': group.occupancy ?? '',
    }))
    const detail = filtered.map(room => ({
      Day: DAYS[Number(day) - 1], Periods: periods.join(', '), Room: room.number, Block: room.block,
      Floor: room.floor ?? '', Type: room.type, Capacity: room.capacity ?? '', Status: room.status,
      Assigned: room.assigned || '', 'Day Assignment': room.assigned_for_day || '',
    }))
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), 'Capacity Summary')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detail), 'Room Details')
    XLSX.writeFile(workbook, `capacity-occupancy-${DAYS[Number(day) - 1]}-P${periods.join('-')}.xlsx`)
  }

  return <section aria-label="Day and hour capacity-wise room occupancy">
    <h3 style={{ margin: '0 0 6px' }}>Capacity-wise Room Occupancy</h3>
    <p style={{ margin: '0 0 14px', color: 'var(--text-3)', fontSize: 13 }}>
      Select a day and one or more periods. A room is occupied when it has a booking in any selected period.
    </p>
    <div style={{ padding: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input" aria-label="Occupancy day" value={day} onChange={event => setDay(event.target.value)} style={{ maxWidth: 280 }}>
          {DAYS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
        </select>
        <button className="btn btn-primary" onClick={check} disabled={busy}>{busy ? 'Checking...' : 'Check Occupancy'}</button>
      </div>
    </div>
    <PeriodPicker selected={periods} onChange={setPeriods} max={24} />

    {data?.noData && <p role="status" style={{ marginTop: 18 }}>{data.message}</p>}
    <RoomDataWarning diagnostics={data?.diagnostics} />
    {data && !data.noData && <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 20 }}>
      <p style={{ color: 'var(--text-3)', fontSize: 12 }}>Timetable: {data.filename || data.snapshotLabel} · Room details: {data.assignmentSource}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select className="input" aria-label="Occupancy block" value={block} onChange={event => setBlock(event.target.value)} style={{ width: 160 }}>
          <option value="">All blocks</option>{blocks.map(value => <option key={value} value={value}>Block {value}</option>)}
        </select>
        <select className="input" aria-label="Occupancy room type" value={type} onChange={event => setType(event.target.value)} style={{ width: 170 }}>
          <option value="">All room types</option>{types.map(value => <option key={value}>{value}</option>)}
        </select>
        <select className="input" aria-label="Occupancy status" value={status} onChange={event => setStatus(event.target.value)} style={{ width: 150 }}>
          <option value="">All statuses</option><option value="occupied">Occupied</option><option value="free">Free</option>
        </select>
        <select className="input" aria-label="Room capacity" value={capacity} onChange={event => setCapacity(event.target.value)} style={{ width: 160 }}>
          <option value="">All capacities</option>{capacities.map(value => <option key={value} value={value}>{value} seats</option>)}
        </select>
        <input className="input" aria-label="Search occupancy rooms" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search room or assignment..." style={{ flex: '1 1 220px' }} />
        <button className="btn btn-success" onClick={download} disabled={!filtered.length}>Export Excel</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 10, marginBottom: 18 }}>
        {[
          ['Rooms', filtered.length], ['Occupied rooms', occupied.length], ['Free rooms', free.length],
          ['Total seats', totalCapacity], ['Occupied seats', occupiedCapacity], ['Free seats', freeCapacity],
          ['Seat occupancy', showPct(pct(occupiedCapacity, totalCapacity))],
        ].map(([label, value]) => <div key={label} className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{label}</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 5 }}>{value}</div>
        </div>)}
      </div>

      <h4 style={{ margin: '0 0 10px' }}>Capacity-wise summary</h4>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 20 }}>
        <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
          <thead><tr>{['Capacity', 'Rooms', 'Occupied', 'Free', 'Total seats', 'Occupied seats', 'Free seats', 'Seat occupancy'].map(label => <th key={label} style={th}>{label}</th>)}</tr></thead>
          <tbody>{capacityGroups.map(group => <tr key={group.capacity}>
            <th scope="row" style={td}>{group.capacity === 'Unknown' ? 'Unknown' : `${group.capacity} seats`}</th>
            <td style={td}>{group.rooms}</td><td style={td}>{group.occupied}</td><td style={td}>{group.free}</td>
            <td style={td}>{group.seats}</td><td style={td}>{group.occupiedSeats}</td><td style={td}>{group.freeSeats}</td>
            <td style={td}>{showPct(group.occupancy)}</td>
          </tr>)}</tbody>
        </table>
      </div>

      <h4 style={{ margin: '0 0 10px' }}>Room details</h4>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        <table style={{ width: '100%', minWidth: 950, borderCollapse: 'collapse' }}>
          <thead><tr>{['Room', 'Block', 'Floor', 'Type', 'Capacity', 'Status', 'Assigned', `${DAYS[Number(day) - 1]} Assignment`].map(label => <th key={label} style={th}>{label}</th>)}</tr></thead>
          <tbody>{filtered.map(room => <tr key={room.number}>
            <th scope="row" style={td}>{room.number}</th><td style={td}>{room.block}</td><td style={td}>{room.floor ?? '?'}</td>
            <td style={td}>{room.type}</td><td style={td}>{room.capacity ?? '?'}</td>
            <td style={{ ...td, color: room.status === 'occupied' ? '#ef4444' : '#10b981', fontWeight: 700 }}>{room.status === 'occupied' ? 'Occupied' : 'Free'}</td>
            <td style={td}>{room.assigned || 'Not specified'}</td><td style={td}>{room.assigned_for_day || 'Not specified'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!filtered.length && <p role="status">No rooms match the selected filters.</p>}
    </div>}
  </section>
}
