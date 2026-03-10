'use client'
import { useState, useEffect } from 'react'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useAuth, useApi } from '@/components/AuthContext'
import TimetableGrid from '@/components/timetable/TimetableGrid'
import SearchInput from '@/components/ui/SearchInput'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

function FacultyContent() {
  const { user, loading, isAdmin } = useAuth()
  const router = useRouter()
  const { get } = useApi()

  const [query,    setQuery]    = useState('')
  const [allFac,   setAllFac]   = useState([])
  const [result,   setResult]   = useState(null)
  const [busy,     setBusy]     = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading])

  useEffect(() => {
    if (!user) return
    get('/api/timetable/faculty?list=1')
      .then(d => d.success && setAllFac(d.faculty || []))
      .catch(() => {})
  }, [user])

  const suggestions = query.length >= 2
    ? allFac
        .filter(f => f.name?.toLowerCase().includes(query.toLowerCase()) || f.id?.includes(query))
        .slice(0, 8)
        .map(f => ({ label: f.name, sub: `${f.id} · ${f.dept || '—'}`, value: f.id }))
    : []

  const search = async (q = query) => {
    const term = (typeof q === 'object' ? q.value : q).trim()
    if (!term) return toast.error('Enter a faculty name or ID')
    setBusy(true)
    try {
      const d = await get(`/api/timetable/faculty?q=${encodeURIComponent(term)}`)
      if (!d.success) throw new Error(d.message)
      setResult(d)
    } catch (err) {
      toast.error(err.message)
      setResult(null)
    } finally { setBusy(false) }
  }

  if (loading || !user) return null

  return (
    <PortalShell>
      <h2 style={{ margin:'0 0 16px', fontFamily:"'DM Serif Display',serif", color:'var(--text)', fontSize:'1.25rem' }}>
        Faculty Timetable
      </h2>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20, padding:14,
        background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)', alignItems:'center' }}>
        <SearchInput
          value={query}
          onChange={setQuery}
          onSelect={s => { setQuery(s.label + ' (' + s.value + ')'); search(s.value) }}
          suggestions={suggestions}
          placeholder="Search by name or employee ID…"
        />
        <button className="btn btn-primary" onClick={() => search()} disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>

      {result ? (
        <TimetableGrid
          title={`${result.faculty.name} (${result.faculty.id})`}
          badge={`${result.faculty.weeklyLoad} hrs / week · ${result.faculty.dept || '—'}`}
          entries={result.entries}
          mode="ROOM"
          hlTerm={result.faculty.name}
          showAllHours={isAdmin}
        />
      ) : !busy && (
        <EmptyState icon="👤" text="Search for a faculty member to view their weekly schedule." />
      )}
    </PortalShell>
  )
}

export default function FacultyPage() {
  return <AuthProvider><FacultyContent /></AuthProvider>
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-3)' }}>
      <div style={{ fontSize:'3rem', marginBottom:12 }}>{icon}</div>
      <p style={{ margin:0, fontSize:15 }}>{text}</p>
    </div>
  )
}
