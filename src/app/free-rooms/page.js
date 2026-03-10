'use client'
import { useState, useEffect } from 'react'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useAuth, useApi } from '@/components/AuthContext'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function FreeRoomsContent() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { get } = useApi()

  const [day,     setDay]     = useState('1')
  const [periods, setPeriods] = useState([])
  const [rooms,   setRooms]   = useState([])
  const [fetched, setFetched] = useState(false)
  const [busy,    setBusy]    = useState(false)
  const [block,   setBlock]   = useState('')
  const [sort,    setSort]    = useState('NUMBER')
  const [search,  setSearch]  = useState('')

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])

  const check = async () => {
    if (!periods.length) return toast.error('Select at least one period')
    setBusy(true)
    try {
      const d = await get(`/api/free/rooms?day=${day}&periods=${periods.join(',')}`)
      if (!d.success) throw new Error(d.message)
      setRooms(d.rooms || [])
      setFetched(true); setBlock('')
      toast.success(`Found ${d.count} free rooms`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const allBlocks = [...new Set(rooms.map(r => r.block).filter(Boolean))].sort()

  const filtered = rooms
    .filter(r => !block || r.block === block)
    .filter(r => !search || r.number?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'CAPACITY') return (b.capacity || 0) - (a.capacity || 0)
      return a.number?.localeCompare(b.number || '', undefined, { numeric: true })
    })

  const download = () => {
    if (!filtered.length) return toast.error('Nothing to export')
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      'Room No': r.number,
      'Block': r.block || '?',
      'Type': r.type || '—',
      'Capacity': r.capacity || '?',
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Free_Rooms')
    XLSX.writeFile(wb, `free-rooms-${DAYS[+day-1]}-P${periods.join('')}.xlsx`)
  }

  if (loading || !user) return null
  return (
    <PortalShell>
      <h2 style={{ margin:'0 0 16px', fontFamily:"'DM Serif Display',serif", fontSize:'1.25rem' }}>Find Free Rooms</h2>

      <div style={{ marginBottom:20 }}>
        <p style={{ margin:'0 0 8px', fontWeight:700, fontSize:13, color:'var(--text-2)' }}>STEP 1 — Select day &amp; periods</p>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', padding:14, background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)', alignItems:'center' }}>
          <select className="input" value={day} onChange={e => setDay(e.target.value)} style={{ maxWidth:170 }}>
            {DAYS.map((d, i) => <option key={i+1} value={i+1}>{d}</option>)}
          </select>
          <button className="btn btn-primary" onClick={check} disabled={busy}>
            {busy ? 'Checking…' : 'Check Availability'}
          </button>
        </div>
        <PeriodPicker selected={periods} onChange={setPeriods} max={24} />
      </div>

      {fetched && (
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:20 }}>
          <p style={{ margin:'0 0 10px', fontWeight:700, fontSize:13, color:'var(--text-2)' }}>STEP 2 — Filter &amp; Search</p>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12, alignItems:'center' }}>
            <select className="input" value={block} onChange={e => setBlock(e.target.value)} style={{ maxWidth:160 }}>
              <option value="">— Select Block —</option>
              {allBlocks.map(b => <option key={b} value={b}>Block {b}</option>)}
            </select>
            <select className="input" value={sort} onChange={e => setSort(e.target.value)} style={{ maxWidth:160 }}>
              <option value="NUMBER">Sort by Number</option>
              <option value="CAPACITY">Sort by Capacity</option>
            </select>
            <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search room…" style={{ flex:1 }} />
          </div>

          {block && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div style={{ fontWeight:700, color:'var(--brand)', fontSize:14 }}>
                  {filtered.length} free rooms in Block {block}
                </div>
                {filtered.length > 0 && (
                  <button className="btn btn-success" style={{ padding:'7px 14px', fontSize:13 }} onClick={download}>
                    📥 Excel
                  </button>
                )}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10 }}>
                {filtered.map(r => (
                  <div key={r.number} className="result-card" style={{ flexDirection:'column', alignItems:'flex-start', gap:4 }}>
                    <div style={{ fontWeight:700, fontSize:15 }}>{r.number}</div>
                    <div style={{ fontSize:12, color:'var(--text-3)' }}>
                      {r.type || '—'} · Cap: {r.capacity || '?'}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </PortalShell>
  )
}

export default function FreeRoomsPage() { return <AuthProvider><FreeRoomsContent /></AuthProvider> }
