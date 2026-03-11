'use client'
import { useState, useEffect } from 'react'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useAuth, useApi } from '@/components/AuthContext'
import TimetableGrid from '@/components/timetable/TimetableGrid'
import SearchInput from '@/components/ui/SearchInput'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

const DESG_LABEL = { R: 'Research', Ac: 'Academic', Ad: 'Administrative' }

function ProfileCard({ user }) {
  if (!user) return null
  const fields = [
    { label: 'EID',                     value: user.eid },
    { label: 'Department',              value: user.dept },
    { label: 'Designation',             value: user.designation },
    { label: 'Cohort',                  value: user.cohort },
    { label: 'Designation Category',    value: user.designation_category ? `${user.designation_category} — ${DESG_LABEL[user.designation_category] || user.designation_category}` : null },
    { label: 'Assigned Responsibility', value: user.assigned_responsibility },
    { label: 'Load as per Designation', value: user.load_as_per_designation != null ? `${user.load_as_per_designation} hrs` : null },
    { label: 'Permitted Load (PL)',      value: user.pl != null ? `${user.pl} hrs` : null },
  ].filter(f => f.value)

  if (!fields.length) return null
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10, marginBottom:20,
      padding:16, background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)' }}>
      {fields.map(f => (
        <div key={f.label}>
          <div style={{ fontSize:11, color:'var(--text-3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.04em' }}>{f.label}</div>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginTop:2 }}>{f.value}</div>
        </div>
      ))}
    </div>
  )
}

function FacultyContent() {
  const { user, loading, isAdmin, isFaculty } = useAuth()
  const router = useRouter()
  const { get } = useApi()

  const [query,     setQuery]     = useState('')
  const [allFac,    setAllFac]    = useState([])
  const [result,    setResult]    = useState(null)
  const [clashes,   setClashes]   = useState([])
  const [busy,      setBusy]      = useState(false)
  const [snapshots, setSnapshots] = useState([])
  const [snapId,    setSnapId]    = useState('')
  const [lastTerm,  setLastTerm]  = useState('')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
    if (!loading && user?.mustChangePassword) router.replace('/change-password')
  }, [user, loading])

  useEffect(() => {
    if (!user) return
    get('/api/upload/versions')
      .then(d => {
        if (d.success) {
          const live = d.snapshots.filter(s => s.type === 'live')
          setSnapshots(live)
          const active = live.find(s => s.isActive)
          if (active) setSnapId(active.snapshotId)
        }
      }).catch(() => {})
  }, [user])

  useEffect(() => {
    if (!user) return
    if (isFaculty && user.eid) { search(user.eid); return }
    get('/api/timetable/faculty?list=1')
      .then(d => d.success && setAllFac(d.faculty || []))
      .catch(() => {})
  }, [user])

  useEffect(() => {
    if (lastTerm && snapId) search(lastTerm, snapId)
  }, [snapId])

  const suggestions = query.length >= 2
    ? allFac
        .filter(f => f.name?.toLowerCase().includes(query.toLowerCase()) || f.id?.includes(query))
        .slice(0, 8)
        .map(f => ({ label: f.name, sub: `${f.id} · ${f.dept || '—'}`, value: f.id }))
    : []

  const search = async (q = query, snap = snapId) => {
    const term = (typeof q === 'object' ? q.value : q).trim()
    if (!term) return toast.error('Enter a faculty name or ID')
    setBusy(true)
    setClashes([])
    setLastTerm(term)
    try {
      const sp = snap ? `&snap=${encodeURIComponent(snap)}` : ''
      const d = await get(`/api/timetable/faculty?q=${encodeURIComponent(term)}${sp}`)
      if (!d.success) throw new Error(d.message)
      setResult(d)
      get(`/api/timetable/faculty-clashes?q=${encodeURIComponent(term)}${sp}`)
        .then(c => { if (c.success) setClashes(c.clashes || []) })
        .catch(() => {})
    } catch (err) {
      toast.error(err.message)
      setResult(null)
    } finally { setBusy(false) }
  }

  if (loading || !user) return null

  const viewingOld = snapId && snapshots.length > 0 && !snapshots.find(s => s.snapshotId === snapId)?.isActive

  return (
    <PortalShell>
      <h2 style={{ margin:'0 0 16px', fontFamily:"'DM Serif Display',serif", color:'var(--text)', fontSize:'1.25rem' }}>
        {isFaculty ? 'My Timetable' : 'Faculty Timetable'}
      </h2>

      {isFaculty && <ProfileCard user={user} />}

      {snapshots.length > 1 && (
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap', padding:'10px 14px',
          background:'var(--surface-2)', borderRadius:8, border:'1px solid var(--border)' }}>
          <span style={{ fontSize:12, color:'var(--text-3)', fontWeight:700, whiteSpace:'nowrap' }}>📅 VERSION:</span>
          <select className="input" value={snapId} onChange={e => setSnapId(e.target.value)}
            style={{ fontSize:13, flex:1, maxWidth:420 }}>
            {snapshots.map(s => (
              <option key={s.snapshotId} value={s.snapshotId}>
                {s.label}{s.isActive ? ' ✓ Current' : ''}
              </option>
            ))}
          </select>
          {viewingOld && (
            <span style={{ fontSize:12, background:'#fef3c7', color:'#92400e', padding:'3px 10px', borderRadius:999, fontWeight:600, whiteSpace:'nowrap' }}>
              Historical version
            </span>
          )}
        </div>
      )}

      {!isFaculty && (
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
      )}

      {result ? (
        <TimetableGrid
          title={isFaculty ? result.faculty.name : `${result.faculty.name} (${result.faculty.id})`}
          badge={`${result.faculty.weeklyLoad} hrs / week · ${result.faculty.dept || '—'}`}
          entries={result.entries}
          mode="ROOM"
          hlTerm={result.faculty.name}
          showAllHours={false}
          clashes={clashes}
        />
      ) : !busy && !isFaculty && (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-3)' }}>
          <div style={{ fontSize:'3rem', marginBottom:12 }}>👤</div>
          <p style={{ margin:0, fontSize:15 }}>Search for a faculty member to view their weekly schedule.</p>
        </div>
      )}
    </PortalShell>
  )
}

export default function FacultyPage() {
  return <AuthProvider><FacultyContent /></AuthProvider>
}
