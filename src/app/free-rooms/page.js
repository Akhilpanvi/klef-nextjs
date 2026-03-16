'use client'
import { useState, useEffect } from 'react'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useAuth, useApi } from '@/components/AuthContext'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const DAYS     = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DAY_KEYS = ['Mon','Tue','Wed','Thu','Fri','Sat']

const getPctColor = p => p < 40 ? '#10b981' : p < 75 ? '#f59e0b' : '#ef4444'

function UtilBar({ label, value, max, pct }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,color:"var(--text-3)",marginBottom:3,gap:8 }}>
        <span style={{minWidth:80,flexShrink:0}}>{label}</span>
        <span style={{fontWeight:700,color:getPctColor(pct),whiteSpace:"nowrap"}}>{value}/{max} ({pct}%)</span>
      </div>
      <div style={{ width:'100%', height:6, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:getPctColor(pct), borderRadius:3, transition:'width 0.4s' }} />
      </div>
    </div>
  )
}

// ── Tab 1: Find Free Rooms ────────────────────────────────────────────────────
function FindFreeRoomsTab({ onAnalyze }) {
  const { get } = useApi()
  const [day,     setDay]     = useState('1')
  const [periods, setPeriods] = useState([])
  const [rooms,   setRooms]   = useState([])
  const [fetched, setFetched] = useState(false)
  const [busy,    setBusy]    = useState(false)
  const [noData,  setNoData]  = useState(false)
  const [block,   setBlock]   = useState('')
  const [type,    setType]    = useState('')
  const [sort,    setSort]    = useState('NUMBER')
  const [search,  setSearch]  = useState('')

  const check = async () => {
    if (!periods.length) return toast.error('Select at least one period')
    setBusy(true); setNoData(false)
    try {
      const d = await get(`/api/free/rooms?day=${day}&periods=${periods.join(',')}`)
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setNoData(true); setFetched(false); return }
      setRooms(d.rooms||[]); setFetched(true); setBlock(''); setType(''); setSearch('')
      toast.success(`Found ${d.count} free rooms`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const allBlocks = [...new Set(rooms.map(r=>r.block).filter(Boolean))].sort()
  const allTypes  = [...new Set(rooms.map(r=>r.type).filter(t=>t&&t!=='?'))].sort()

  const filtered = rooms
    .filter(r => !block  || r.block===block)
    .filter(r => !type   || r.type===type)
    .filter(r => !search || r.number?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => {
      const aHasMeta = a.type !== '?', bHasMeta = b.type !== '?'
      if(aHasMeta && !bHasMeta) return -1
      if(!aHasMeta && bHasMeta) return 1
      if (sort==='CAPACITY') return (b.capacity||0)-(a.capacity||0)
      if (sort==='BLOCK')    return (a.block||'').localeCompare(b.block||'')
      return a.number?.localeCompare(b.number||'',undefined,{numeric:true})
    })

  const download = () => {
    if (!filtered.length) return toast.error('Nothing to export')
    const ws = XLSX.utils.json_to_sheet(filtered.map(r=>({'Room No':r.number,'Block':r.block||'?','Type':r.type||'?','Capacity':r.capacity||'?','Dept':r.dept||'—'})))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Free_Rooms')
    XLSX.writeFile(wb,`free-rooms-${DAYS[+day-1]}-P${periods.join('')}.xlsx`)
  }

  return (
    <div>
      <p style={lSt}>STEP 1 — Select day &amp; periods</p>
      <div style={rSt}>
        <select className="input" value={day} onChange={e=>setDay(e.target.value)} style={{maxWidth:170}}>
          {DAYS.map((d,i)=><option key={i+1} value={i+1}>{d}</option>)}
        </select>
        <button className="btn btn-primary" onClick={check} disabled={busy}>{busy?'Checking…':'Check Availability'}</button>
      </div>
      <PeriodPicker selected={periods} onChange={setPeriods} max={24} />

      {noData && <div style={{marginTop:20,padding:16,background:'var(--surface-2)',borderRadius:10,border:'1px solid var(--border)',color:'var(--text-2)',fontSize:14}}>⚠️ No Roomwise timetable uploaded yet. Ask admin to upload Roomwise-TT CSV.</div>}

      {fetched && (
        <div style={{borderTop:'1px solid var(--border)',paddingTop:20,marginTop:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div>
              <p style={{...lSt,margin:0}}>STEP 2 — Filter &amp; Search</p>
              <div style={{fontWeight:700,color:'var(--brand)',fontSize:14,marginTop:4}}>{filtered.length} free rooms</div>
            </div>
            <button className="btn btn-success" style={{padding:'7px 14px',fontSize:13}} onClick={download}>📥 Export Excel</button>
          </div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
            <select className="input" value={block} onChange={e=>setBlock(e.target.value)} style={{maxWidth:150}}>
              <option value="">All Blocks</option>{allBlocks.map(b=><option key={b} value={b}>Block {b}</option>)}
            </select>
            <select className="input" value={type} onChange={e=>setType(e.target.value)} style={{maxWidth:150}}>
              <option value="">All Types</option>{allTypes.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <select className="input" value={sort} onChange={e=>setSort(e.target.value)} style={{maxWidth:160}}>
              <option value="NUMBER">Sort by Number</option>
              <option value="CAPACITY">Sort by Capacity</option>
              <option value="BLOCK">Sort by Block</option>
            </select>
            <input className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search room…" style={{flex:1,minWidth:120}}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10}}>
            {filtered.map(r=>(
              <div key={r.number} className="result-card" style={{flexDirection:'column',alignItems:'flex-start',gap:4}}>
                <div style={{fontWeight:700,fontSize:15}}>{r.number}</div>
                <div style={{fontSize:12,color:'var(--text-3)'}}>{r.type||'?'} · Cap: {r.capacity||'?'}</div>
                <div style={{fontSize:11,color:'var(--text-3)'}}>Block {r.block}</div>
                <button className="btn btn-primary" style={{marginTop:6,padding:'4px 10px',fontSize:12,width:'100%'}} onClick={()=>onAnalyze(r.number)}>Analyze</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 2: All Rooms Stats ────────────────────────────────────────────────────
function AllRoomsTab({ onAnalyze }) {
  const { get } = useApi()
  const [stats,   setStats]   = useState([])
  const [loading, setLoading] = useState(false)
  const [noData,  setNoData]  = useState(false)
  const [mode,    setMode]    = useState('weekly')
  const [day,     setDay]     = useState('1')
  const [block,   setBlock]   = useState('')
  const [type,    setType]    = useState('')
  const [sort,    setSort]    = useState('UTIL_DESC')

  useEffect(()=>{ loadStats() },[])

  const loadStats = async () => {
    setLoading(true)
    try {
      const d = await get('/api/free/room-stats')
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setNoData(true); return }
      setStats(d.stats||[])
    } catch(err){ toast.error(err.message) }
    finally{ setLoading(false) }
  }

  const allBlocks = [...new Set(stats.map(r=>r.block).filter(Boolean))].sort()
  const allTypes  = [...new Set(stats.map(r=>r.type).filter(t=>t&&t!=='?'))].sort()

  const filtered = stats
    .filter(r=>!block||r.block===block)
    .filter(r=>!type||r.type===type)
    .sort((a,b)=>{
      if(sort==='UTIL_ASC')  return a.weeklyPct-b.weeklyPct
      if(sort==='UTIL_DESC') return b.weeklyPct-a.weeklyPct
      if(sort==='CAPACITY')  return (b.capacity||0)-(a.capacity||0)
      if(sort==='NAME')      return a.number.localeCompare(b.number,undefined,{numeric:true})
      return 0
    })

  const exportExcel = () => {
    if(!filtered.length) return toast.error('No data')
    const ws = XLSX.utils.json_to_sheet(filtered.map(r=>({'Room':r.number,'Block':r.block,'Type':r.type,'Cap':r.capacity,'Mon%':r.dayStats?.Mon,'Tue%':r.dayStats?.Tue,'Wed%':r.dayStats?.Wed,'Thu%':r.dayStats?.Thu,'Fri%':r.dayStats?.Fri,'Sat%':r.dayStats?.Sat,'Weekly%':r.weeklyPct})))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Room Stats')
    XLSX.writeFile(wb,'KLEF_Room_Stats.xlsx')
  }

  if(loading) return <div style={{padding:20,color:'var(--text-2)'}}>Loading stats…</div>
  if(noData)  return <div style={{padding:16,background:'var(--surface-2)',borderRadius:10,border:'1px solid var(--border)',color:'var(--text-2)',fontSize:14}}>⚠️ No Roomwise timetable uploaded yet.</div>

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',gap:6}}>
          {[['weekly','Weekly'],['daily','Daily Summary'],['hourly','Hourly Breakdown']].map(([k,l])=>(
            <button key={k} onClick={()=>setMode(k)} className={mode===k?'btn btn-primary':'btn btn-ghost'} style={{fontSize:13,padding:'6px 14px'}}>{l}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:6}}>
          <button className="btn btn-success" style={{fontSize:13,padding:'6px 14px'}} onClick={exportExcel}>📥 Export</button>
          <button className="btn btn-ghost"   style={{fontSize:13,padding:'6px 14px'}} onClick={loadStats}>↻ Refresh</button>
        </div>
      </div>

      {mode==='hourly' && (
        <div style={{marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:13,fontWeight:700}}>Day:</span>
          <select className="input" value={day} onChange={e=>setDay(e.target.value)} style={{maxWidth:160}}>
            {DAYS.map((d,i)=><option key={i+1} value={i+1}>{d}</option>)}
          </select>
        </div>
      )}

      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
        <select className="input" value={block} onChange={e=>setBlock(e.target.value)} style={{maxWidth:150}}>
          <option value="">All Blocks</option>{allBlocks.map(b=><option key={b} value={b}>Block {b}</option>)}
        </select>
        <select className="input" value={type} onChange={e=>setType(e.target.value)} style={{maxWidth:150}}>
          <option value="">All Types</option>{allTypes.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input" value={sort} onChange={e=>setSort(e.target.value)} style={{maxWidth:170}}>
          <option value="UTIL_DESC">Most Used</option>
          <option value="UTIL_ASC">Least Used</option>
          <option value="CAPACITY">Biggest Capacity</option>
          <option value="NAME">Name A–Z</option>
        </select>
      </div>

      <div style={{fontSize:13,color:'var(--text-3)',marginBottom:10}}>{filtered.length} rooms</div>

      {mode==='weekly' && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:12}}>
          {filtered.map(r=>(
            <div key={r.number} className="result-card" style={{flexDirection:'column',alignItems:'flex-start',gap:6}}>
              <div style={{fontWeight:700,fontSize:15}}>{r.number}</div>
              <div style={{fontSize:12,color:'var(--text-3)'}}>{r.type||'?'} · Cap: {r.capacity||'?'} · Block {r.block}</div>
              <div style={{width:'100%',marginTop:4}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-3)',marginBottom:3}}>
                  <span>Weekly Usage</span><span style={{fontWeight:700,color:getPctColor(r.weeklyPct)}}>{r.weeklyPct}%</span>
                </div>
                <div style={{width:'100%',height:6,background:'var(--border)',borderRadius:3,overflow:'hidden'}}>
                  <div style={{width:`${r.weeklyPct}%`,height:'100%',background:getPctColor(r.weeklyPct),borderRadius:3}}/>
                </div>
              </div>
              <button className="btn btn-primary" style={{marginTop:4,padding:'4px 10px',fontSize:12,width:'100%'}} onClick={()=>onAnalyze(r.number)}>Analyze</button>
            </div>
          ))}
        </div>
      )}

      {mode==='daily' && (
        <div style={{overflowX:'auto',borderRadius:8,border:'1px solid var(--border)'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:700}}>
            <thead><tr style={{background:'var(--surface-2)'}}>
              {['Room','Block','Type','Cap','Mon','Tue','Wed','Thu','Fri','Sat','Weekly',''].map(h=>(
                <th key={h} style={thSt}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(r=>(
                <tr key={r.number} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'10px 12px',fontWeight:700}}>{r.number}</td>
                  <td style={{padding:'10px 12px',fontSize:13}}>{r.block}</td>
                  <td style={{padding:'10px 12px',fontSize:13}}>{r.type}</td>
                  <td style={{padding:'10px 12px',fontSize:13}}>{r.capacity||'?'}</td>
                  {DAY_KEYS.map(d=>(
                    <td key={d} style={{padding:'10px 12px',fontSize:13,fontWeight:700,color:getPctColor(r.dayStats?.[d]||0)}}>{r.dayStats?.[d]||0}%</td>
                  ))}
                  <td style={{padding:'10px 12px',fontSize:13,fontWeight:700,color:getPctColor(r.weeklyPct)}}>{r.weeklyPct}%</td>
                  <td style={{padding:'10px 12px'}}><button className="btn btn-primary" style={{padding:'4px 10px',fontSize:12}} onClick={()=>onAnalyze(r.number)}>Analyze</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode==='hourly' && (
        <div style={{overflowX:'auto',borderRadius:8,border:'1px solid var(--border)'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}>
            <thead><tr style={{background:'var(--surface-2)'}}>
              <th style={thSt}>Room</th><th style={thSt}>Cap</th>
              {Array.from({length:11},(_,i)=>i+1).map(p=><th key={p} style={thSt}>{p}</th>)}
              <th style={thSt}></th>
            </tr></thead>
            <tbody>
              {filtered.map(r=>{
                const dayKey = DAY_KEYS[parseInt(day)-1]
                const busyHours = new Set()
                // We know total busy for this day from dayCounts but need hour-level
                // Use hourStats which has per-hour counts across days
                return (
                  <tr key={r.number} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'8px 12px',fontWeight:700,fontSize:13}}>{r.number}<br/><span style={{fontSize:11,color:'var(--text-3)',fontWeight:400}}>{r.dept}</span></td>
                    <td style={{padding:'8px 12px',fontSize:13}}>{r.capacity||'?'}</td>
                    {Array.from({length:11},(_,i)=>i+1).map(p=>{
                      const h = r.hourStats?.[p]
                      const isBusy = h && h.count > 0
                      return <td key={p} style={{padding:'6px 4px',fontSize:10,textAlign:'center',color:isBusy?'#ef4444':'#10b981',fontWeight:700}}>{isBusy?'B':'F'}</td>
                    })}
                    <td style={{padding:'8px 12px'}}><button className="btn btn-primary" style={{padding:'4px 10px',fontSize:12}} onClick={()=>onAnalyze(r.number)}>Analyze</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab 3: Analytics Search ───────────────────────────────────────────────────
function AnalyticsTab({ initialRoom, onClear }) {
  const { get } = useApi()
  const [query,       setQuery]       = useState(initialRoom||'')
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [allRooms,    setAllRooms]    = useState([])

  useEffect(()=>{
    get('/api/free/room-stats').then(d=>{ if(d.success&&d.stats) setAllRooms(d.stats.map(r=>r.number)) })
  },[])

  useEffect(()=>{
    if(initialRoom){ setQuery(initialRoom); doAnalyze(initialRoom) }
  },[initialRoom])

  const onInput = v => {
    setQuery(v)
    if(v.length<2){ setSuggestions([]); return }
    setSuggestions(allRooms.filter(r=>r.toLowerCase().includes(v.toLowerCase())).slice(0,8))
  }

  const doAnalyze = async (room) => {
    const name = (room||query).trim().toUpperCase()
    if(!name) return toast.error('Enter a room number')
    setLoading(true); setSuggestions([])
    try {
      const d = await get(`/api/free/room-analyze?room=${encodeURIComponent(name)}`)
      if(!d.success) throw new Error(d.message)
      setData(d); onClear?.()
    } catch(err){ toast.error(err.message) }
    finally{ setLoading(false) }
  }

  return (
    <div>
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:20,position:'relative'}}>
        <div style={{position:'relative',flex:1}}>
          <input className="input" value={query} onChange={e=>onInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&doAnalyze()} placeholder="Enter Room Number (e.g. C007)" autoComplete="off"/>
          {suggestions.length>0 && (
            <div style={{position:'absolute',top:'105%',left:0,right:0,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,zIndex:100,boxShadow:'0 4px 12px rgba(0,0,0,.15)'}}>
              {suggestions.map(r=>(
                <div key={r} onClick={()=>{setQuery(r);doAnalyze(r);setSuggestions([])}}
                  style={{padding:'10px 14px',cursor:'pointer',fontSize:13,borderBottom:'1px solid var(--border)',color:'var(--text)'}}>{r}</div>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={()=>doAnalyze()} disabled={loading}>{loading?'Analyzing…':'Analyze'}</button>
      </div>

      {data && (
        <div>
          <h3 style={{fontSize:'1.3rem',fontWeight:800,color:'var(--brand)',marginBottom:16}}>
            Analytics for <span style={{color:'var(--text)'}}>{data.room}</span>
            <span style={{fontSize:13,color:'var(--text-3)',fontWeight:400,marginLeft:10}}>(Capacity: {data.capacity||'?'})</span>
          </h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            <div className="result-card" style={{flexDirection:'column',alignItems:'center',padding:24}}>
              <div style={{fontSize:12,fontWeight:700,color:'var(--text-3)',marginBottom:8}}>WEEKLY OVERVIEW</div>
              <div style={{fontSize:'3rem',fontWeight:800,color:'var(--brand)'}}>{data.weeklyPct}%</div>
              <div style={{fontSize:13,color:'var(--text-3)',marginTop:4}}>Total Occupancy: {data.totalBusy}/{data.totalSlots}</div>
            </div>
            <div className="result-card" style={{flexDirection:'column',padding:20}}>
              <div style={{fontSize:12,fontWeight:700,color:'var(--text-3)',marginBottom:12}}>DAY-WISE USAGE</div>
              {DAY_KEYS.map((d,i)=>{
                const count = data.dayCounts?.[d]||0
                const pct   = Math.round((count/11)*100)
                return <UtilBar key={d} label={DAYS[i]} value={count} max={11} pct={pct}/>
              })}
            </div>
          </div>
          <div className="result-card" style={{flexDirection:'column',padding:20}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text-3)',marginBottom:12}}>HOUR-WISE USAGE</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:'8px 20px'}}>
              {Array.from({length:11},(_,i)=>i+1).map(p=>{
                const h = data.hourStats?.[p]||{count:0,pct:0}
                return <UtilBar key={p} label={`Period ${p}`} value={h.count} max={6} pct={h.pct}/>
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lSt = { margin:'0 0 8px', fontWeight:700, fontSize:13, color:'var(--text-2)' }
const rSt = { display:'flex', gap:10, flexWrap:'wrap', padding:14, background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)', alignItems:'center', marginBottom:12 }
const thSt = { padding:'10px 8px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--text-3)', borderBottom:'2px solid var(--border)', background:'var(--surface-2)', whiteSpace:'nowrap' }

// ── Main Page ─────────────────────────────────────────────────────────────────
function FreeRoomsContent() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [tab,         setTab]         = useState('find')
  const [analyzeRoom, setAnalyzeRoom] = useState(null)

  useEffect(()=>{ if(!loading&&!user) router.replace('/login') },[user,loading])
  if(loading||!user) return null

  const goAnalyze = room => { setAnalyzeRoom(room); setTab('analytics') }

  return (
    <PortalShell>
      <h2 style={{margin:'0 0 16px',fontFamily:"'DM Serif Display',serif",fontSize:'1.25rem'}}>Room Availability</h2>

      <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:'2px solid var(--border)'}}>
        {[{id:'find',label:'🔍 Find Free Rooms'},{id:'stats',label:'📊 All Rooms Stats'},{id:'analytics',label:'🔬 Analytics Search'}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'8px 18px',fontSize:13,fontWeight:700,border:'none',background:'none',cursor:'pointer',
            borderBottom:tab===t.id?'2px solid var(--brand)':'2px solid transparent',
            color:tab===t.id?'var(--brand)':'var(--text-2)',marginBottom:-2,transition:'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab==='find'      && <FindFreeRoomsTab onAnalyze={goAnalyze}/>}
      {tab==='stats'     && <AllRoomsTab onAnalyze={goAnalyze}/>}
      {tab==='analytics' && <AnalyticsTab initialRoom={analyzeRoom} onClear={()=>setAnalyzeRoom(null)}/>}
    </PortalShell>
  )
}

export default function FreeRoomsPage() {
  return <AuthProvider><FreeRoomsContent/></AuthProvider>
}
