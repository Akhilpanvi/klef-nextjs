'use client'
import { useState, useEffect } from 'react'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useAuth, useApi } from '@/components/AuthContext'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function FreeFacultyContent() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { get } = useApi()

  const [day,     setDay]     = useState('1')
  const [periods, setPeriods] = useState([])
  const [faculty, setFaculty] = useState([])
  const [fetched, setFetched] = useState(false)
  const [busy,    setBusy]    = useState(false)

  const [selDepts, setSelDepts] = useState([])
  const [search,   setSearch]   = useState('')
  const [sort,     setSort]     = useState('ID')

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])

  const check = async () => {
    if (!periods.length) return toast.error('Select at least one period')
    setBusy(true)
    try {
      const d = await get(`/api/free/faculty?day=${day}&periods=${periods.join(',')}`)
      if (!d.success) throw new Error(d.message)
      setFaculty(d.faculty || [])
      setFetched(true)
      setSelDepts([])
      toast.success(`Found ${d.count} free faculty`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const allDepts = [...new Set(faculty.map(f => f.dept).filter(Boolean))].sort()
  const toggleDept = d => setSelDepts(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])

  const filtered = faculty
    .filter(f => selDepts.includes(f.dept))
    .filter(f => !search || f.name?.toLowerCase().includes(search.toLowerCase()) || f.id?.includes(search))
    .sort((a, b) => sort === 'NAME' ? a.name?.localeCompare(b.name || '') : a.id?.localeCompare(b.id || '', undefined, { numeric: true }))

  const download = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(f => ({ 'EMP ID': f.id, Name: f.name, Department: f.dept, 'Weekly Load': f.weeklyLoad })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Free_Faculty')
    XLSX.writeFile(wb, `free-faculty-${DAYS[+day-1]}-P${periods.join('')}.xlsx`)
  }

  if (loading || !user) return null
  return (
    <PortalShell>
      <h2 style={{ margin:'0 0 16px', fontFamily:"'DM Serif Display',serif", fontSize:'1.25rem' }}>Find Free Faculty</h2>

      {/* Step 1 */}
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
        <PeriodPicker selected={periods} onChange={setPeriods} max={11} />
      </div>

      {/* Step 2 */}
      {fetched && (
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:20 }}>
          <p style={{ margin:'0 0 10px', fontWeight:700, fontSize:13, color:'var(--text-2)' }}>STEP 2 — Filter by department</p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16, maxHeight:160, overflowY:'auto', padding:4 }}>
            {allDepts.map(d => (
              <button key={d} className={`pill${selDepts.includes(d) ? ' active' : ''}`} onClick={() => toggleDept(d)}>
                {d}
              </button>
            ))}
          </div>

          {selDepts.length > 0 && (
            <>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12, alignItems:'center' }}>
                <select className="input" value={sort} onChange={e => setSort(e.target.value)} style={{ maxWidth:150 }}>
                  <option value="ID">Sort by ID</option>
                  <option value="NAME">Sort by Name</option>
                </select>
                <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or ID…" style={{ flex:1 }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <span style={{ fontWeight:700, color:'var(--brand)', fontSize:14 }}>{filtered.length} faculty found</span>
                {filtered.length > 0 && (
                  <button className="btn btn-success" style={{ padding:'7px 14px', fontSize:13 }} onClick={download}>
                    📥 Excel
                  </button>
                )}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:10 }}>
                {filtered.map(f => (
                  <div key={f.id} className="result-card">
                    <div>
                      <div style={{ fontWeight:700, fontSize:14 }}>{f.name}</div>
                      <div style={{ fontSize:12, color:'var(--text-3)', marginTop:3 }}>{f.id} · {f.dept}</div>
                    </div>
                    <span className="badge badge-green">{f.weeklyLoad} hrs</span>
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

export default function FreeFacultyPage() { return <AuthProvider><FreeFacultyContent /></AuthProvider> }
