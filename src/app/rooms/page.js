'use client'
import { useState, useEffect } from 'react'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useAuth, useApi } from '@/components/AuthContext'
import TimetableGrid from '@/components/timetable/TimetableGrid'
import SearchInput from '@/components/ui/SearchInput'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const DAYS     = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DAY_KEYS = ['Mon','Tue','Wed','Thu','Fri','Sat']

function EmptyState({ icon, text }) {
  return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-3)' }}>
      <div style={{ fontSize:'3rem', marginBottom:12 }}>{icon}</div>
      <p style={{ margin:0 }}>{text}</p>
    </div>
  )
}

// Small ERP section badges (shared pattern from free-rooms page)
const ASSOC_ORDER = ['MA','A','B','C','D']
function ErpBadges({ sections = [] }) {
  const seen = new Set()
  const clean = sections.filter(s => {
    const k = (s.assoc||'').toString().trim().toUpperCase()
    if (!k || seen.has(k)) return false
    seen.add(k); return true
  }).sort((a,b) => {
    const ai = ASSOC_ORDER.indexOf(a.assoc.toUpperCase())
    const bi = ASSOC_ORDER.indexOf(b.assoc.toUpperCase())
    return (ai===-1?99:ai) - (bi===-1?99:bi)
  })
  if (!clean.length) return null
  return (
    <span style={{ display:'flex', flexWrap:'wrap', gap:3, marginTop:4 }}>
      {clean.map(s => (
        <span key={s.assoc} style={{ fontSize:10, fontWeight:600, color:'var(--text)',
          background:'var(--surface-2)', border:'1px solid var(--text-3)',
          borderRadius:3, padding:'1px 4px', whiteSpace:'nowrap' }}>
          {s.assoc}:{s.erp_id}
        </span>
      ))}
    </span>
  )
}

// ── Tab 1: Room Timetable ──────────────────────────────────────────────────────
function RoomTimetableTab() {
  const { isAdmin } = useAuth()
  const { get } = useApi()

  const [query,    setQuery]    = useState('')
  const [allRooms, setAllRooms] = useState([])
  const [result,   setResult]   = useState(null)
  const [busy,     setBusy]     = useState(false)

  useEffect(() => {
    get('/api/timetable/room?list=1').then(d => d.success && setAllRooms(d.rooms || []))
  }, [])

  const suggestions = query.length >= 1
    ? allRooms
        .filter(r => r.number?.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8)
        .map(r => ({ label: r.number, sub: `Block ${r.block} · ${r.type} · Cap: ${r.capacity || '?'}`, value: r.number }))
    : []

  const search = async (q = query) => {
    const term = (typeof q === 'object' ? q.value : q).trim()
    if (!term) return toast.error('Enter a room number')
    setBusy(true)
    try {
      const d = await get(`/api/timetable/room?q=${encodeURIComponent(term)}`)
      if (!d.success) throw new Error(d.message)
      setResult(d)
    } catch (err) { toast.error(err.message); setResult(null) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20, padding:14,
        background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)', alignItems:'center' }}>
        <SearchInput
          value={query} onChange={setQuery}
          onSelect={s => { setQuery(s.label); search(s.value) }}
          suggestions={suggestions}
          placeholder="Search room number (e.g. R306, A301)…"
        />
        <button className="btn btn-primary" onClick={() => search()} disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>
      {result ? (
        <TimetableGrid
          title={`Room: ${result.room.number}`}
          badge={`${result.room.type} · Block ${result.room.block} · Cap: ${result.room.capacity}`}
          entries={result.entries}
          mode="FACULTY"
          hlTerm={result.room.number}
          showAllHours={isAdmin}
        />
      ) : !busy && <EmptyState icon="🚪" text="Search for a room to view its weekly schedule." />}
    </div>
  )
}

// ── Tab 2: Free Rooms (Live TT) ────────────────────────────────────────────────
function LiveFreeRoomsTab() {
  const { get } = useApi()

  const [day,      setDay]      = useState('1')
  const [periods,  setPeriods]  = useState([])
  const [rooms,    setRooms]    = useState([])
  const [fetched,  setFetched]  = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [noData,   setNoData]   = useState(false)
  const [noDataMsg, setNoDataMsg] = useState('')
  const [meta,     setMeta]     = useState(null) // { isLive, label, syncedAt }
  const [block,    setBlock]    = useState('')
  const [type,     setType]     = useState('')
  const [sort,     setSort]     = useState('NUMBER')
  const [search,   setSearch]   = useState('')

  const check = async () => {
    if (!periods.length) return toast.error('Select at least one period')
    setBusy(true); setNoData(false); setFetched(false)
    try {
      const d = await get(`/api/free/live-rooms?day=${day}&periods=${periods.join(',')}`)
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setNoData(true); setNoDataMsg(d.message); return }
      setRooms(d.rooms || [])
      setMeta({ isLive: d.isLive, label: d.label, syncedAt: d.syncedAt })
      setFetched(true); setBlock(''); setType(''); setSearch('')
      toast.success(`Found ${d.count} free rooms`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const allBlocks = [...new Set(rooms.map(r => r.block).filter(Boolean))].sort()
  const allTypes  = [...new Set(rooms.map(r => r.type).filter(t => t && t !== '?'))].sort()

  const filtered = rooms
    .filter(r => !block  || r.block === block)
    .filter(r => !type   || r.type  === type)
    .filter(r => !search || r.number?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aM = a.type !== '?', bM = b.type !== '?'
      if (aM && !bM) return -1; if (!aM && bM) return 1
      if (sort === 'CAPACITY') return (b.capacity || 0) - (a.capacity || 0)
      if (sort === 'BLOCK')    return (a.block || '').localeCompare(b.block || '')
      return a.number?.localeCompare(b.number || '', undefined, { numeric: true })
    })

  const download = () => {
    if (!filtered.length) return toast.error('Nothing to export')
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      'Room No': r.number,
      'ERP Sections': r.erp_sections?.map(s => `${s.assoc}:${s.erp_id}`).join(' | ') || '—',
      'Block': r.block || '?', 'Type': r.type || '?',
      'Capacity': r.capacity || '?', 'Dept': r.dept || '—',
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Free_Rooms_Live')
    XLSX.writeFile(wb, `free-rooms-live-${DAYS[+day - 1]}-P${periods.join('')}.xlsx`)
  }

  const lSt = { margin:'0 0 8px', fontWeight:700, fontSize:13, color:'var(--text-2)' }
  const rSt = { display:'flex', gap:10, flexWrap:'wrap', padding:14, background:'var(--surface-2)',
    borderRadius:10, border:'1px solid var(--border)', alignItems:'center', marginBottom:12 }

  return (
    <div>
      {/* Source badge */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <span style={{ fontSize:12, fontWeight:700, padding:'4px 10px', borderRadius:20,
          background: '#fef2f2', color:'#b91c1c', border:'1px solid #fecaca' }}>
          🔴 Live Timetable
        </span>
        <span style={{ fontSize:12, color:'var(--text-3)' }}>
          Rooms free in the active live timetable (Google Sheets sync / BTT)
        </span>
      </div>

      <p style={lSt}>STEP 1 — Select day &amp; periods</p>
      <div style={rSt}>
        <select className="input" value={day} onChange={e => setDay(e.target.value)} style={{ maxWidth:170 }}>
          {DAYS.map((d, i) => <option key={i+1} value={i+1}>{d}</option>)}
        </select>
        <button className="btn btn-primary" onClick={check} disabled={busy}>
          {busy ? 'Checking…' : 'Check Availability'}
        </button>
      </div>
      <PeriodPicker selected={periods} onChange={setPeriods} max={24} />

      {noData && (
        <div style={{ marginTop:20, padding:16, background:'var(--surface-2)', borderRadius:10,
          border:'1px solid var(--border)', color:'var(--text-2)', fontSize:14 }}>
          ⚠️ {noDataMsg}
        </div>
      )}

      {fetched && meta && (
        <div style={{ marginTop:6, marginBottom:16, fontSize:12, color:'var(--text-3)' }}>
          {meta.isLive ? '🔴 Google Sheets live data' : `📂 Dataset: ${meta.label}`}
          {meta.syncedAt && <> · Last synced {new Date(meta.syncedAt).toLocaleString('en-IN')}</>}
        </div>
      )}

      {fetched && (
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:20, marginTop:8 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div>
              <p style={{ ...lSt, margin:0 }}>STEP 2 — Filter &amp; Search</p>
              <div style={{ fontWeight:700, color:'var(--brand)', fontSize:14, marginTop:4 }}>
                {filtered.length} free rooms
              </div>
            </div>
            <button className="btn btn-success" style={{ padding:'7px 14px', fontSize:13 }} onClick={download}>
              📥 Export Excel
            </button>
          </div>

          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
            <select className="input" value={block} onChange={e => setBlock(e.target.value)} style={{ maxWidth:150 }}>
              <option value="">All Blocks</option>
              {allBlocks.map(b => <option key={b} value={b}>Block {b}</option>)}
            </select>
            <select className="input" value={type} onChange={e => setType(e.target.value)} style={{ maxWidth:150 }}>
              <option value="">All Types</option>
              {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="input" value={sort} onChange={e => setSort(e.target.value)} style={{ maxWidth:160 }}>
              <option value="NUMBER">Sort by Number</option>
              <option value="CAPACITY">Sort by Capacity</option>
              <option value="BLOCK">Sort by Block</option>
            </select>
            <input className="input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search room…" style={{ flex:1, minWidth:120 }} />
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:'var(--text-3)' }}>
              No rooms match the current filters.
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10 }}>
              {filtered.map(r => (
                <div key={r.number} className="result-card" style={{ flexDirection:'column', alignItems:'flex-start', gap:4 }}>
                  <div style={{ fontWeight:700, fontSize:15 }}>{r.number}</div>
                  <ErpBadges sections={r.erp_sections} />
                  <div style={{ fontSize:12, color:'var(--text-3)' }}>{r.type || '?'} · Cap: {r.capacity || '?'}</div>
                  <div style={{ fontSize:11, color:'var(--text-3)' }}>Block {r.block}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const TABS = [
  { id: 'timetable', label: '🚪 Room Timetable' },
  { id: 'free',      label: '🔴 Free Rooms (Live TT)' },
]

// ── Main Page ──────────────────────────────────────────────────────────────────
function RoomsContent() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState('timetable')

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])
  if (loading || !user) return null

  return (
    <PortalShell>
      <h2 style={{ margin:'0 0 16px', fontFamily:"'DM Serif Display',serif", fontSize:'1.25rem' }}>Rooms</h2>

      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'2px solid var(--border)', flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'8px 18px', fontSize:13, fontWeight:700, border:'none', background:'none', cursor:'pointer',
            borderBottom: tab === t.id ? '2px solid var(--brand)' : '2px solid transparent',
            color: tab === t.id ? 'var(--brand)' : 'var(--text-2)',
            marginBottom: -2, transition:'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'timetable' && <RoomTimetableTab />}
      {tab === 'free'      && <LiveFreeRoomsTab />}
    </PortalShell>
  )
}

export default function RoomsPage() { return <AuthProvider><RoomsContent /></AuthProvider> }
