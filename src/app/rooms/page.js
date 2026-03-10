'use client'
import { useState, useEffect } from 'react'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useAuth, useApi } from '@/components/AuthContext'
import TimetableGrid from '@/components/timetable/TimetableGrid'
import SearchInput from '@/components/ui/SearchInput'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

function RoomsContent() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { get } = useApi()

  const [query,  setQuery]  = useState('')
  const [allRooms, setAll]  = useState([])
  const [result, setResult] = useState(null)
  const [busy,   setBusy]   = useState(false)

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])
  useEffect(() => {
    if (!user) return
    get('/api/timetable/room?list=1').then(d => d.success && setAll(d.rooms || []))
  }, [user])

  const suggestions = query.length >= 1
    ? allRooms.filter(r => r.number?.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
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

  if (loading || !user) return null
  return (
    <PortalShell>
      <h2 style={{ margin:'0 0 16px', fontFamily:"'DM Serif Display',serif", fontSize:'1.25rem' }}>Room Timetable</h2>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20, padding:14,
        background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)', alignItems:'center' }}>
        <SearchInput value={query} onChange={setQuery}
          onSelect={s => { setQuery(s.label); search(s.value) }}
          suggestions={suggestions} placeholder="Search room number (e.g. R306, A301)…" />
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
        />
      ) : !busy && <EmptyState icon="🚪" text="Search for a room to view its weekly schedule." />}
    </PortalShell>
  )
}

export default function RoomsPage() { return <AuthProvider><RoomsContent /></AuthProvider> }
function EmptyState({ icon, text }) {
  return <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-3)' }}><div style={{ fontSize:'3rem', marginBottom:12 }}>{icon}</div><p style={{ margin:0 }}>{text}</p></div>
}
