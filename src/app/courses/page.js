'use client'
import { useState, useEffect } from 'react'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useAuth, useApi } from '@/components/AuthContext'
import TimetableGrid from '@/components/timetable/TimetableGrid'
import SearchInput from '@/components/ui/SearchInput'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

const YEARS = [{ v:'1', l:'Year 1' },{ v:'2', l:'Year 2' },{ v:'3', l:'Year 3' },{ v:'4', l:'Year 4' }]
const REGS  = [{ v:'', l:'All Batches' },{ v:'R25', l:'R25' },{ v:'R24', l:'R24' },{ v:'R23', l:'R23' },{ v:'R22', l:'R22' }]

function CoursesContent() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { get } = useApi()

  const [year,   setYear]   = useState('2')
  const [reg,    setReg]    = useState('')
  const [query,  setQuery]  = useState('')
  const [all,    setAll]    = useState([])
  const [result, setResult] = useState(null)
  const [busy,   setBusy]   = useState(false)

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])

  useEffect(() => {
    if (!user || !year) return
    setQuery(''); setResult(null)
    const url = `/api/timetable/course?list=1&year=${year}${reg ? `&reg=${reg}` : ''}`
    get(url).then(d => d.success && setAll(d.courses || []))
  }, [user, year, reg])

  const suggestions = query.length >= 2
    ? all.filter(c => c.name?.toLowerCase().includes(query.toLowerCase()) || c.code?.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8).map(c => ({ label: c.name, sub: `${c.code} · Y${c.year} · ${c.reg || ''}`, value: c.code }))
    : []

  const search = async (q = query) => {
    const term = (typeof q === 'object' ? q.value : q).trim()
    if (!term) return toast.error('Enter a course name or code')
    if (!year)  return toast.error('Select a year first')
    setBusy(true)
    try {
      const url = `/api/timetable/course?q=${encodeURIComponent(term)}&year=${year}${reg ? `&reg=${reg}` : ''}`
      const d = await get(url)
      if (!d.success) throw new Error(d.message)
      setResult(d)
    } catch (err) { toast.error(err.message); setResult(null) }
    finally { setBusy(false) }
  }

  if (loading || !user) return null
  return (
    <PortalShell>
      <h2 style={{ margin:'0 0 16px', fontFamily:"'DM Serif Display',serif", fontSize:'1.25rem' }}>Course Timetable</h2>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20, padding:14,
        background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)', alignItems:'center' }}>
        <select className="input" value={year} onChange={e => setYear(e.target.value)} style={{ maxWidth:130 }}>
          {YEARS.map(y => <option key={y.v} value={y.v}>{y.l}</option>)}
        </select>
        <select className="input" value={reg} onChange={e => setReg(e.target.value)} style={{ maxWidth:140 }}>
          {REGS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
        </select>
        <SearchInput value={query} onChange={setQuery}
          onSelect={s => { setQuery(`${s.value} – ${s.label}`); search(s.value) }}
          suggestions={suggestions} placeholder="Search course name or code…"
          disabled={!year} />
        <button className="btn btn-primary" onClick={() => search()} disabled={busy || !year}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>
      {result ? (
        <TimetableGrid
          title={`${result.course.name}`}
          badge={`${result.course.code} · Y${result.course.year}`}
          entries={result.entries}
          mode="BOTH"
        />
      ) : !busy && <EmptyState />}
    </PortalShell>
  )
}

export default function CoursesPage() { return <AuthProvider><CoursesContent /></AuthProvider> }
function EmptyState() {
  return <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-3)' }}><div style={{ fontSize:'3rem', marginBottom:12 }}>📚</div><p style={{ margin:0 }}>Select year and search for a course.</p></div>
}
