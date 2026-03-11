'use client'
import { useState, useEffect, Suspense } from 'react'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useAuth, useApi } from '@/components/AuthContext'
import TimetableGrid from '@/components/timetable/TimetableGrid'
import SearchInput from '@/components/ui/SearchInput'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'

const DESG_LABEL = { R: 'Research', Ac: 'Academic', Ad: 'Administrative' }

function ProfileCard({ data }) {
  if (!data) return null
  const fields = [
    { label: 'EID',                     value: data.eid || data.id },
    { label: 'Department',              value: data.dept },
    { label: 'Designation',             value: data.designation },
    { label: 'Cohort',                  value: data.cohort },
    { label: 'Designation Category',    value: data.designation_category ? `${data.designation_category} — ${DESG_LABEL[data.designation_category] || data.designation_category}` : null },
    { label: 'Assigned Responsibility', value: data.assigned_responsibility },
    { label: 'Load as per Designation', value: data.load_as_per_designation != null ? `${data.load_as_per_designation} hrs` : null },
    { label: 'Permitted Load (PL)',      value: data.pl != null ? `${data.pl} hrs` : null },
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
  const searchParams = useSearchParams()
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
    // Auto-search if ?q= param is present (e.g. from admin "View Timetable" link)
    const qParam = searchParams?.get('q')
    if (qParam) { setQuery(qParam); search(qParam); }
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

  // For faculty's own page: merge auth user (looked up by _id, always correct) with API result.
  // API result may have null profile fields if eid lookup misses; fall back to auth user fields.
  const PROFILE_KEYS = ['designation','cohort','designation_category','assigned_responsibility','load_as_per_designation','pl']
  const profileData = (() => {
    if (!isFaculty) return result?.faculty || null
    const base = result?.faculty ? { ...result.faculty } : { ...user }
    PROFILE_KEYS.forEach(k => { if (base[k] == null && user[k] != null) base[k] = user[k] })
    if (!base.eid && user.eid) base.eid = user.eid
    if (!base.dept && user.dept) base.dept = user.dept
    return base
  })()

  // Badge text: weeklyLoad always shown; admin also sees extraLoad if any
  const badgeParts = [
    `${result?.faculty?.weeklyLoad ?? 0} hrs / week`,
    result?.faculty?.dept || '—',
  ]
  if (isAdmin && result?.faculty?.extraLoad > 0) {
    badgeParts.push(`+${result.faculty.extraLoad} hrs after P11`)
  }

  return (
    <PortalShell>
      <h2 style={{ margin:'0 0 16px', fontFamily:"'DM Serif Display',serif", color:'var(--text)', fontSize:'1.25rem' }}>
        {isFaculty ? 'My Timetable' : 'Faculty Timetable'}
      </h2>

      {/* Version dropdown */}
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
            <span className="badge badge-yellow">Historical version</span>
          )}
        </div>
      )}

      {/* Admin search bar */}
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

      {/* Profile card — shown for faculty (own page) or admin (after search result) */}
      {(isFaculty || (isAdmin && result)) && <ProfileCard data={profileData} />}

      {result ? (
        <TimetableGrid
          title={isFaculty ? result.faculty.name : `${result.faculty.name} (${result.faculty.id})`}
          badge={badgeParts.join(' · ')}
          entries={result.entries}
          mode="ROOM"
          hlTerm={result.faculty.name}
          showAllHours={isAdmin}
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
  return (
    <AuthProvider>
      <Suspense fallback={null}>
        <FacultyContent />
      </Suspense>
    </AuthProvider>
  )
}
