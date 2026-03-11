'use client'
import { useState, useEffect } from 'react'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useAuth, useApi } from '@/components/AuthContext'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const DAY_FULL = { 1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday' }
const SEV_LABEL = { severe:'SEVERE', warn:'WARNING', info:'INFO' }
const TYPE_ICON  = { 'Room Overlap':'🔴','Dual Faculty':'🟡','Faculty Double-Booked':'🔵' }

function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ padding:'16px 18px', textAlign:'center' }}>
      <div style={{ fontSize:'2.2rem', fontWeight:800, color, lineHeight:1, fontFamily:"'DM Serif Display',serif" }}>{value}</div>
      <div style={{ fontSize:11, color:'var(--text-3)', fontWeight:600, textTransform:'uppercase', marginTop:4, letterSpacing:'.04em' }}>{label}</div>
    </div>
  )
}

function ClashCard({ c }) {
  return (
    <div className={`clash-card clash-${c.severity}`}>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:10 }}>
        <span style={{
          fontSize:11, fontWeight:800, padding:'3px 10px', borderRadius:999,
          background: c.severity==='severe' ? '#fecdd3' : c.severity==='warn' ? '#fef3c7' : '#dbeafe',
          color:      c.severity==='severe' ? '#9f1239' : c.severity==='warn' ? '#92400e' : '#1e40af',
          textTransform:'uppercase', letterSpacing:'.05em',
        }}>
          {SEV_LABEL[c.severity]}
        </span>
        <span style={{ fontWeight:700, fontSize:13 }}>{TYPE_ICON[c.type]} {c.type}</span>
        <span style={{ fontSize:12, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:6, padding:'2px 9px', color:'var(--text-2)' }}>
          {DAY_FULL[c.day]} · Period {c.hour}
        </span>
        <span style={{ fontSize:12, background:'#dbeafe', color:'#1e40af', borderRadius:6, padding:'2px 9px', fontWeight:600 }}>
          📍 {c.room} <em style={{ fontWeight:400 }}>({c.roomType})</em>
        </span>
      </div>

      <div className="clash-detail-grid">
        <div><span style={{ fontSize:11, color:'var(--text-3)' }}>Course 1</span><br /><b>{c.courseCode1}</b> — {c.courseName1}</div>
        <div><span style={{ fontSize:11, color:'var(--text-3)' }}>Course 2</span><br /><b>{c.courseCode2}</b> — {c.courseName2}</div>
        <div><span style={{ fontSize:11, color:'var(--text-3)' }}>Sections</span><br />{c.section}</div>
        <div><span style={{ fontSize:11, color:'var(--text-3)' }}>Faculty</span><br />
          {c.faculty1}{c.faculty1 !== c.faculty2 ? ` & ${c.faculty2}` : ''}
        </div>
      </div>

      <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid rgba(0,0,0,.08)', fontSize:12, color:'var(--text-3)', fontStyle:'italic' }}>
        {c.desc}
      </div>
    </div>
  )
}

function ClashContent() {
  const { user, loading, hasPermission } = useAuth()
  const router = useRouter()
  const { post } = useApi()

  const [clashes,  setClashes]  = useState([])
  const [stats,    setStats]    = useState(null)
  const [hasRun,   setHasRun]   = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [typeF,    setTypeF]    = useState('')
  const [dayF,     setDayF]     = useState('')
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
    if (!loading && user && !hasPermission('view_clash')) router.replace('/faculty')
  }, [user, loading])

  const run = async () => {
    setBusy(true)
    try {
      const d = await post('/api/clash/run', {})
      if (!d.success) throw new Error(d.message)
      setClashes(d.clashes); setStats(d.stats); setHasRun(true)
      toast.success(`${d.stats.total} clashes detected (dataset: ${d.stats.dataset})`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const filtered = clashes.filter(c => {
    if (typeF && c.type !== typeF) return false
    if (dayF  && c.day  !== +dayF)  return false
    if (search) {
      const blob = `${c.room} ${c.courseCode1} ${c.courseName1} ${c.courseCode2} ${c.courseName2} ${c.faculty1} ${c.faculty2} ${c.section}`.toLowerCase()
      if (!blob.includes(search.toLowerCase())) return false
    }
    return true
  })

  const download = () => {
    if (!filtered.length) return toast.error('Nothing to export')
    const rows = filtered.map(c => ({
      'Type': c.type, 'Severity': SEV_LABEL[c.severity],
      'Day': DAY_FULL[c.day], 'Period': c.hour,
      'Room': c.room, 'Room Type': c.roomType,
      'Course 1': c.courseCode1, 'Course Name 1': c.courseName1,
      'Course 2': c.courseCode2, 'Course Name 2': c.courseName2,
      'Sections': c.section, 'Faculty 1': c.faculty1, 'Faculty 2': c.faculty2,
      'Description': c.desc,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clashes')
    XLSX.writeFile(wb, `clash-report-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  if (loading || !user) return null
  return (
    <PortalShell>
      <h2 style={{ margin:'0 0 16px', fontFamily:"'DM Serif Display',serif", fontSize:'1.25rem' }}>⚠ Clash Detection</h2>

      {/* Stats */}
      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:12, marginBottom:16 }}>
          <StatCard label="Total Clashes"   value={stats.total}  color="var(--brand)" />
          <StatCard label="🔴 Room Overlaps" value={stats.severe} color="#e11d48" />
          <StatCard label="🟡 Dual Faculty"  value={stats.warn}   color="#f59e0b" />
          <StatCard label="🔵 Double-Booked" value={stats.info}   color="#3b82f6" />
        </div>
      )}

      {/* Controls */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, padding:14,
        background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)', alignItems:'center' }}>
        <select className="input" value={typeF} onChange={e => setTypeF(e.target.value)} style={{ flex:1, minWidth:170 }}>
          <option value="">All Clash Types</option>
          <option value="Room Overlap">🔴 Room Overlap</option>
          <option value="Dual Faculty">🟡 Dual Faculty</option>
          <option value="Faculty Double-Booked">🔵 Faculty Double-Booked</option>
        </select>
        <select className="input" value={dayF} onChange={e => setDayF(e.target.value)} style={{ flex:1, minWidth:130 }}>
          <option value="">All Days</option>
          {[1,2,3,4,5,6].map(d => <option key={d} value={d}>{DAY_FULL[d]}</option>)}
        </select>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search room, course, faculty…" style={{ flex:2, minWidth:180 }} />
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? 'Running…' : '🔍 Run Clash Check'}
        </button>
        {hasRun && filtered.length > 0 && (
          <button className="btn btn-success" onClick={download}>📥 Export</button>
        )}
      </div>

      {/* Results */}
      {!hasRun ? (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-3)', border:'2px dashed var(--border)', borderRadius:12 }}>
          <div style={{ fontSize:'3rem', marginBottom:12 }}>🛡️</div>
          <p style={{ margin:'0 0 6px', fontWeight:700, fontSize:15 }}>No clash check run yet.</p>
          <p style={{ margin:0, fontSize:14 }}>Upload your timetable data, then click <b>Run Clash Check</b>.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'#16a34a', border:'2px dashed #bbf7d0', borderRadius:12 }}>
          <div style={{ fontSize:'3rem', marginBottom:12 }}>✅</div>
          <p style={{ margin:0, fontWeight:700, fontSize:15 }}>No clashes found for the current filter!</p>
        </div>
      ) : (
        <div className="fade-up">
          {filtered.map((c, i) => <ClashCard key={i} c={c} />)}
        </div>
      )}
    </PortalShell>
  )
}

export default function ClashPage() { return <AuthProvider><ClashContent /></AuthProvider> }
