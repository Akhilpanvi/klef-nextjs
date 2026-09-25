'use client'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { useApi } from '@/components/AuthContext'
import PeriodPicker from '@/components/ui/PeriodPicker'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const cell = { padding: '9px 11px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontSize: 12 }
const byRoom = (a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })

export default function BlockFreeRoomsTab() {
  const { get } = useApi()
  const [day, setDay] = useState('1')
  const [periods, setPeriods] = useState([])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [block, setBlock] = useState('')
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')

  const check = async () => {
    if (!periods.length) return toast.error('Select at least one period')
    setLoading(true); setError(''); setResult(null)
    try {
      const data = await get(`/api/free/rooms?day=${day}&periods=${periods.join(',')}`)
      if (!data.success) throw new Error(data.message || 'Unable to load block-wise free rooms')
      setResult(data)
      setBlock(''); setType(''); setSearch('')
      if (!data.noData) toast.success(`Found ${data.count} free rooms`)
    } catch (err) {
      setError(err.message)
      toast.error(err.message)
    } finally { setLoading(false) }
  }

  const freeRooms = result?.rooms || []
  const blocks = [...new Set(freeRooms.map(room => room.block).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const types = [...new Set(freeRooms.map(room => room.type).filter(value => value && value !== '?'))].sort()
  const query = search.trim().toLowerCase()
  const filtered = freeRooms.filter(room => (!block || room.block === block) && (!type || room.type === type) &&
    (!query || [room.number, room.type, room.assigned, room.assigned_for_day]
      .some(value => String(value || '').toLowerCase().includes(query))))
  const grouped = [...new Set(filtered.map(room => room.block || '?'))]
    .map(name => ({ block: name, rooms: filtered.filter(room => (room.block || '?') === name).sort(byRoom) }))
    .sort((a, b) => a.block.localeCompare(b.block, undefined, { numeric: true }))
  const totalCapacity = filtered.reduce((sum, room) => sum + (Number(room.capacity) || 0), 0)

  const download = () => {
    if (!filtered.length) return
    const rows = grouped.flatMap(group => group.rooms.map(room => ({
      Day: DAYS[Number(day) - 1], Periods: periods.join(', '), Block: group.block,
      Floor: room.floor ?? '', 'Room No': room.number, Type: room.type || '',
      Capacity: room.capacity ?? '', Assigned: room.assigned || '',
      'Day Assignment': room.assigned_for_day || '',
    })))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Block Free Rooms')
    XLSX.writeFile(workbook, `block-free-rooms-${DAYS[Number(day) - 1]}-P${periods.join('-')}.xlsx`)
  }

  return <section aria-label="Day and hour block-wise free rooms">
    <div>
      <h3 style={{ margin: '0 0 6px' }}>Block-wise Free Rooms</h3>
      <p style={{ margin: '0 0 14px', color: 'var(--text-3)', fontSize: 13 }}>Select a day and one or more periods. A room is shown only when it is free in every selected period.</p>
    </div>

    <div style={{ padding: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <select className="input" aria-label="Day" value={day} onChange={event => setDay(event.target.value)} style={{ maxWidth: 280 }}>
          {DAYS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
        </select>
        <button className="btn btn-primary" onClick={check} disabled={loading}>{loading ? 'Checking...' : 'Check Availability'}</button>
      </div>
    </div>
    <PeriodPicker selected={periods} onChange={setPeriods} max={24} />

    {error && <p role="alert" style={{ color: 'var(--brand)' }}>{error}</p>}
    {result?.noData && <p role="status" style={{ marginTop: 18 }}>{result.message}</p>}
    {result && !result.noData && <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <select className="input" aria-label="Block" value={block} onChange={event => setBlock(event.target.value)} style={{ width: 170 }}>
          <option value="">All blocks</option>{blocks.map(value => <option key={value} value={value}>Block {value}</option>)}
        </select>
        <select className="input" aria-label="Room type" value={type} onChange={event => setType(event.target.value)} style={{ width: 180 }}>
          <option value="">All room types</option>{types.map(value => <option key={value}>{value}</option>)}
        </select>
        <input className="input" aria-label="Search free rooms" placeholder="Search room or assignment..." value={search} onChange={event => setSearch(event.target.value)} style={{ flex: '1 1 230px' }} />
        <button className="btn btn-success" disabled={!filtered.length} onClick={download}>Export Excel</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 18 }}>
        {[["Free rooms", filtered.length], ["Blocks", grouped.length], ["Total capacity", totalCapacity]].map(([label, value]) =>
          <div key={label} className="card" style={{ padding: 16 }}><div style={{ color: 'var(--text-3)', fontSize: 12 }}>{label}</div><div style={{ fontSize: 25, fontWeight: 800, marginTop: 5 }}>{value}</div></div>)}
      </div>
      {!filtered.length && <p role="status">No free rooms match the selected day, periods, block, and filters.</p>}
      {grouped.map(group => <article key={group.block} className="card" style={{ padding: 16, marginBottom: 18 }}>
        <h4 style={{ margin: '0 0 12px' }}>Block {group.block} · {group.rooms.length} free rooms</h4>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 850, borderCollapse: 'collapse' }}>
          <thead><tr>{['Room', 'Floor', 'Type', 'Capacity', 'Assigned', `${DAYS[Number(day) - 1]} Assignment`].map(label =>
            <th key={label} scope="col" style={{ ...cell, background: 'var(--surface-2)' }}>{label}</th>)}</tr></thead>
          <tbody>{group.rooms.map(room => <tr key={room.number}>
            <th scope="row" style={cell}>{room.number}</th>
            <td style={cell}>{room.floor ?? '?'}</td><td style={cell}>{room.type || '?'}</td>
            <td style={cell}>{room.capacity ?? '?'}</td><td style={cell}>{room.assigned || 'Not specified'}</td>
            <td style={cell}>{room.assigned_for_day || 'Not specified'}</td>
          </tr>)}</tbody>
        </table></div>
      </article>)}
    </div>}
  </section>
}
