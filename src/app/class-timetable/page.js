'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useApi, useAuth } from '@/components/AuthContext'
import PeriodPicker from '@/components/ui/PeriodPicker'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const STATUS = {
  free: { label: 'FREE', color: '#047857', background: '#ecfdf5', border: '#6ee7b7' },
  occupied: { label: 'OCCUPIED', color: '#1d4ed8', background: '#eff6ff', border: '#93c5fd' },
  clash: { label: 'CLASH', color: '#b91c1c', background: '#fef2f2', border: '#f87171' },
  no_data: { label: 'NO TIMETABLE DATA', color: '#6b7280', background: 'var(--surface-2)', border: 'var(--border)' },
}

function ClassTimetableContent() {
  const { user, loading } = useAuth()
  const { get } = useApi()
  const router = useRouter()
  const [day, setDay] = useState('1')
  const [hours, setHours] = useState([1])
  const [rooms, setRooms] = useState([])
  const [counts, setCounts] = useState(null)
  const [busy, setBusy] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [block, setBlock] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading, router])

  const load = async () => {
    if (!hours.length) return toast.error('Select one or two hours')
    setBusy(true)
    try {
      const data = await get(`/api/free/class-timetable?day=${day}&hours=${hours.join(',')}`)
      if (!data.success) throw new Error(data.message)
      if (data.noData) { setRooms([]); setCounts(null); setFetched(true); return toast.error(data.message) }
      setRooms(data.rooms || [])
      setCounts(data.counts || null)
      setFetched(true)
      setBlock(''); setStatus(''); setSearch('')
    } catch (error) { toast.error(error.message) }
    finally { setBusy(false) }
  }

  const blocks = useMemo(() => [...new Set(rooms.map(room => room.block).filter(Boolean))].sort(), [rooms])
  const filtered = rooms.filter(room =>
    (!block || room.block === block) &&
    (!status || room.status === status) &&
    (!search || room.number.toLowerCase().includes(search.toLowerCase()) || room.classes.some(item => item.label.toLowerCase().includes(search.toLowerCase())))
  )

  if (loading || !user) return null

  return (
    <PortalShell>
      <h2 style={{margin:'0 0 6px',fontFamily:"'DM Serif Display',serif",fontSize:'1.25rem'}}>Class Timetable</h2>
      <p style={{margin:'0 0 18px',color:'var(--text-3)',fontSize:13}}>Day and hour-wise status of every room from Room Department Assignments.</p>

      <div style={{padding:14,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10}}>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
          <select className="input" value={day} onChange={event=>setDay(event.target.value)} style={{maxWidth:250}}>
            {DAYS.map((name,index)=><option key={name} value={index+1}>{name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={load} disabled={busy}>{busy ? 'Checking…' : 'Check Availability'}</button>
        </div>
      </div>
      <PeriodPicker selected={hours} onChange={values=>setHours(values.slice(-2))} max={24} />
      <div style={{fontSize:12,color:'var(--text-3)',marginTop:7}}>Select one hour or a two-hour pair. Selected: {hours.length ? hours.join(' and ') : 'none'}</div>

      {counts && <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'16px 0'}}>
        {[['Total',counts.total],['Free',counts.free],['Occupied',counts.occupied],['Clashes',counts.clashes],['No Data',counts.noData]].map(([label,value])=><div key={label} style={{padding:'8px 14px',border:'1px solid var(--border)',borderRadius:8,background:'var(--surface)',fontSize:13}}><b>{value}</b> {label}</div>)}
      </div>}

      {fetched && <>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'16px 0 12px'}}>
          <select className="input" value={block} onChange={event=>setBlock(event.target.value)} style={{maxWidth:150}}><option value="">All Blocks</option>{blocks.map(value=><option key={value} value={value}>Block {value}</option>)}</select>
          <select className="input" value={status} onChange={event=>setStatus(event.target.value)} style={{maxWidth:170}}><option value="">All Statuses</option><option value="free">Free</option><option value="occupied">Occupied</option><option value="clash">Clashes</option><option value="no_data">No Timetable Data</option></select>
          <input className="input" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search room, course or section…" style={{flex:1,minWidth:230}} />
        </div>
        <div style={{fontSize:13,color:'var(--text-3)',marginBottom:10}}>{filtered.length} rooms</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12}}>
          {filtered.map(room => {
            const style = STATUS[room.status]
            return <div key={room.number} style={{padding:14,border:`2px solid ${style.border}`,borderRadius:10,background:style.background,color:'var(--text)'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
                <strong style={{fontSize:17}}>{room.number}</strong>
                <span style={{fontSize:10,fontWeight:800,color:style.color}}>{style.label}</span>
              </div>
              <div style={{fontSize:11,color:'var(--text-3)',marginTop:3}}>Block {room.block} · {room.type || '?'} · Capacity {room.capacity || '?'}</div>
              {room.classes.length === 0
                ? <div style={{fontSize:14,fontWeight:700,color:style.color,marginTop:12}}>{room.status === 'free' ? 'Free for this slot' : 'Roomwise Timetable has no entry for this room'}</div>
                : <div style={{marginTop:10,display:'grid',gap:7}}>{room.classes.map((item,index)=><div key={`${item.hour}-${item.label}-${index}`} style={{fontSize:12,lineHeight:1.4,padding:'7px 8px',background:'rgba(255,255,255,.72)',border:'1px solid rgba(0,0,0,.08)',borderRadius:6}}><b>Hour {item.hour}:</b> {item.label}</div>)}</div>}
            </div>
          })}
        </div>
      </>}
    </PortalShell>
  )
}

export default function ClassTimetablePage() {
  return <AuthProvider><ClassTimetableContent /></AuthProvider>
}
