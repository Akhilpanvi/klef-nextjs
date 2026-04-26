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

// Renders small ERP ID badges for each section (MA, A, B, C, D…)
const ASSOC_ORDER = ['MA','A','B','C','D']
function ErpBadges({ sections = [] }) {
  // Filter out blank assoc, deduplicate by assoc label, then sort
  const seen = new Set()
  const clean = sections.filter(s => {
    const k = (s.assoc||'').toString().trim().toUpperCase()
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  }).sort((a,b) => {
    const ai = ASSOC_ORDER.indexOf(a.assoc.toUpperCase())
    const bi = ASSOC_ORDER.indexOf(b.assoc.toUpperCase())
    return (ai===-1?99:ai) - (bi===-1?99:bi)
  })
  if (!clean.length) return null
  return (
    <span style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:4}}>
      {clean.map(s=>(
        <span key={s.assoc} style={{fontSize:10,fontWeight:600,color:'var(--text)',background:'var(--surface-2)',border:'1px solid var(--text-3)',borderRadius:3,padding:'1px 4px',whiteSpace:'nowrap'}}>
          {s.assoc}:{s.erp_id}
        </span>
      ))}
    </span>
  )
}

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
    const ws = XLSX.utils.json_to_sheet(filtered.map(r=>({'Room No':r.number,'ERP Sections':r.erp_sections?.map(s=>`${s.assoc}:${s.erp_id}`).join(' | ')||'—','Block':r.block||'?','Type':r.type||'?','Capacity':r.capacity||'?','Dept':r.dept||'—'})))
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
                <ErpBadges sections={r.erp_sections}/>
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
    const ws = XLSX.utils.json_to_sheet(filtered.map(r=>({'Room':r.number,'ERP Sections':r.erp_sections?.map(s=>`${s.assoc}:${s.erp_id}`).join(' | ')||'—','Block':r.block,'Type':r.type,'Cap':r.capacity,'Mon%':r.dayStats?.Mon,'Tue%':r.dayStats?.Tue,'Wed%':r.dayStats?.Wed,'Thu%':r.dayStats?.Thu,'Fri%':r.dayStats?.Fri,'Sat%':r.dayStats?.Sat,'Weekly%':r.weeklyPct})))
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
              <ErpBadges sections={r.erp_sections}/>
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
              {['Room','ERP ID','Block','Type','Cap','Mon','Tue','Wed','Thu','Fri','Sat','Weekly',''].map(h=>(
                <th key={h} style={thSt}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(r=>(
                <tr key={r.number} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'10px 12px',fontWeight:700}}>{r.number}</td>
                  <td style={{padding:'10px 12px',fontSize:13}}><ErpBadges sections={r.erp_sections}/></td>
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
                    <td style={{padding:'8px 12px',fontWeight:700,fontSize:13}}>{r.number}<br/><ErpBadges sections={r.erp_sections}/><span style={{fontSize:11,color:'var(--text-3)',fontWeight:400}}>{r.dept}</span></td>
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

// ── Tab 4: Room Search (by room number or ERP ID) ────────────────────────────
function RoomSearchTab() {
  const { get } = useApi()
  const [query,       setQuery]       = useState('')
  const [result,      setResult]      = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [allRooms,    setAllRooms]    = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [showDrop,    setShowDrop]    = useState(false)

  useEffect(() => {
    get('/api/free/room-list').then(d => { if (d.success) setAllRooms(d.rooms) })
  }, [])

  const onInput = v => {
    setQuery(v)
    if (!v.trim()) { setSuggestions([]); setShowDrop(false); return }
    const q = v.trim().toLowerCase()
    const matched = allRooms.filter(r =>
      r.room.toLowerCase().includes(q) ||
      (r.erp_id && String(r.erp_id).includes(q)) ||
      r.erp_ids.some(id => String(id).includes(q))
    ).slice(0, 10)
    setSuggestions(matched)
    setShowDrop(matched.length > 0)
  }

  const pick = (r) => {
    setQuery(r.room)
    setSuggestions([])
    setShowDrop(false)
    doSearch(r.room)
  }

  const doSearch = async (q) => {
    const v = (q ?? query).trim()
    if (!v) return toast.error('Enter a room number or ERP ID')
    setLoading(true); setResult(null); setShowDrop(false); setSuggestions([])
    try {
      const d = await get(`/api/free/room-lookup?q=${encodeURIComponent(v)}`)
      if (!d.success) throw new Error(d.message)
      setResult(d)
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const rows = result ? [
    ['Room Number',  result.room],
    ['Block',        result.block        || '—'],
    ['Type',         result.type         || '—'],
    ['Capacity',     result.capacity     ?? '—'],
    ['Alloted To',   result.alloted_to   || '—'],
    ['Dept Alloted', result.dept_alloted || '—'],
    ['Description',  result.description  || '—'],
  ] : []

  return (
    <div>
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:20,position:'relative'}}>
        <div style={{position:'relative',flex:1}}>
          <input
            className="input"
            value={query}
            onChange={e => onInput(e.target.value)}
            onKeyDown={e => { if(e.key==='Enter') doSearch(); if(e.key==='Escape') setShowDrop(false) }}
            onFocus={() => suggestions.length && setShowDrop(true)}
            onBlur={() => setTimeout(() => setShowDrop(false), 150)}
            placeholder="Enter Room Number (e.g. C007) or ERP ID (e.g. 12345)"
            autoComplete="off"
          />
          {showDrop && (
            <div style={{position:'absolute',top:'105%',left:0,right:0,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,zIndex:100,boxShadow:'0 4px 16px rgba(0,0,0,.18)',maxHeight:280,overflowY:'auto'}}>
              {suggestions.map(r => (
                <div
                  key={r.room}
                  onMouseDown={() => pick(r)}
                  style={{padding:'9px 14px',cursor:'pointer',fontSize:13,borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}
                >
                  <span style={{fontWeight:700,color:'var(--text)'}}>{r.room}</span>
                  {r.erp_id && <span style={{fontSize:11,color:'var(--text-3)',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:4,padding:'1px 6px'}}>ERP {r.erp_id}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => doSearch()} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {result && (
        <div className="result-card" style={{flexDirection:'column',alignItems:'flex-start',gap:8,padding:20}}>
          <div style={{fontWeight:800,fontSize:'1.3rem',color:'var(--brand)'}}>{result.room}</div>
          <ErpBadges sections={result.erp_sections}/>
          <table style={{width:'100%',borderCollapse:'collapse',marginTop:8}}>
            <tbody>
              {rows.map(([label,value])=>(
                <tr key={label} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'8px 12px',fontSize:13,fontWeight:700,color:'var(--text-3)',width:160,whiteSpace:'nowrap'}}>{label}</td>
                  <td style={{padding:'8px 12px',fontSize:14,color:'var(--text)'}}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab 5: Box TT to Room TT Converter ───────────────────────────────────────
const BOX_DAY_KEYS  = ['Mon','Tue','Wed','Thu','Fri','Sat']
const BOX_DAY_NAMES = { Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday' }
const MAX_PERIOD    = 11

function BoxTTTab() {
  const { user, loading: authLoading } = useAuth()
  const { get, post, del } = useApi()
  const isAdmin = user?.role === 'admin'

  const [snap,        setSnap]        = useState(null)
  const [snapLoading, setSnapLoading] = useState(true)
  const [uploading,   setUploading]   = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [file,        setFile]        = useState(null)

  const [allRooms,    setAllRooms]    = useState([])
  const [query,       setQuery]       = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showDrop,    setShowDrop]    = useState(false)
  const [schedule,    setSchedule]    = useState(null)
  const [searching,   setSearching]   = useState(false)
  const [searchedRoom, setSearchedRoom] = useState('')

  const loadSnap = async () => {
    setSnapLoading(true)
    try {
      const d = await get('/api/admin/boxtt')
      setSnap(d.active ? d : null)
      if (d.active) {
        const rd = await get('/api/free/boxtt-rooms')
        if (rd.success) setAllRooms(rd.rooms || [])
      } else {
        setAllRooms([])
      }
    } catch { setSnap(null) }
    finally { setSnapLoading(false) }
  }

  useEffect(() => { if (!authLoading) loadSnap() }, [authLoading])

  const doUpload = async () => {
    if (!file) return toast.error('Select a CSV/Excel file first')
    const fd = new FormData(); fd.append('boxtt', file)
    setUploading(true)
    try {
      const d = await postForm('/api/admin/boxtt', fd)
      if (!d.success) throw new Error(d.message)
      toast.success(d.message)
      setFile(null)
      await loadSnap()
    } catch (err) { toast.error(err.message) }
    finally { setUploading(false) }
  }

  const doDelete = async () => {
    if (!confirm('Delete the Box TT data? This cannot be undone.')) return
    setDeleting(true)
    try {
      const d = await del('/api/admin/boxtt')
      if (!d.success) throw new Error(d.message)
      toast.success('Box TT cleared')
      setSnap(null); setAllRooms([]); setSchedule(null); setSearchedRoom(''); setQuery('')
    } catch (err) { toast.error(err.message) }
    finally { setDeleting(false) }
  }

  const onInput = v => {
    setQuery(v)
    if (!v.trim()) { setSuggestions([]); setShowDrop(false); return }
    const q = v.trim().toUpperCase()
    const matched = allRooms.filter(r => r.includes(q)).slice(0, 10)
    setSuggestions(matched)
    setShowDrop(matched.length > 0)
  }

  const pick = r => {
    setQuery(r); setSuggestions([]); setShowDrop(false)
    doSearch(r)
  }

  const doSearch = async (q) => {
    const room = (q ?? query).trim().toUpperCase()
    if (!room) return toast.error('Enter a room number')
    setSearching(true); setSchedule(null)
    try {
      const d = await get(`/api/free/boxtt-search?room=${encodeURIComponent(room)}`)
      if (!d.success) throw new Error(d.message)
      setSchedule(d.schedule)
      setSearchedRoom(d.room)
    } catch (err) { toast.error(err.message) }
    finally { setSearching(false) }
  }

  const activeDays = schedule ? BOX_DAY_KEYS.filter(d => schedule[d] && Object.keys(schedule[d]).length > 0) : []

  if (authLoading || snapLoading)
    return <div style={{padding:20,color:'var(--text-2)'}}>Loading…</div>

  return (
    <div>
      {/* ── Admin: Upload / Status panel ───────────────────────────────── */}
      {isAdmin && (
        <div style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:16,marginBottom:20}}>
          <p style={{...lSt,marginBottom:10}}>ADMIN — Manage Box TT Data</p>

          {snap ? (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <div style={{fontSize:13,color:'var(--text)'}}>
                <span style={{fontWeight:700}}>Active: </span>{snap.label}
              </div>
              <div style={{fontSize:12,color:'var(--text-3)'}}>
                {snap.rowCount} slot entries · Uploaded by <strong>{snap.uploadedByName || 'admin'}</strong>
                {snap.uploadedAt && <> · {new Date(snap.uploadedAt).toLocaleString('en-IN')}</>}
              </div>
              <div style={{display:'flex',gap:8,marginTop:4,flexWrap:'wrap'}}>
                <label style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={e=>setFile(e.target.files?.[0]||null)} style={{fontSize:12}}/>
                  <button className="btn btn-primary" onClick={doUpload} disabled={uploading||!file} style={{fontSize:12,padding:'5px 12px'}}>
                    {uploading ? 'Uploading…' : 'Replace'}
                  </button>
                </label>
                <button className="btn btn-danger" onClick={doDelete} disabled={deleting} style={{fontSize:12,padding:'5px 12px'}}>
                  {deleting ? 'Clearing…' : 'Delete Data'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={e=>setFile(e.target.files?.[0]||null)} style={{fontSize:13}}/>
              <button className="btn btn-primary" onClick={doUpload} disabled={uploading||!file} style={{fontSize:13,padding:'6px 14px'}}>
                {uploading ? 'Uploading…' : 'Upload Box TT'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── No data banner (non-admin) ──────────────────────────────────── */}
      {!snap && !isAdmin && (
        <div style={{padding:16,background:'var(--surface-2)',borderRadius:10,border:'1px solid var(--border)',color:'var(--text-2)',fontSize:14,marginBottom:16}}>
          ⚠️ No Box TT data uploaded yet. Ask an admin to upload the Box TT CSV.
        </div>
      )}

      {/* ── Search section ──────────────────────────────────────────────── */}
      {snap && (
        <>
          <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:20,position:'relative'}}>
            <div style={{position:'relative',flex:1}}>
              <input
                className="input"
                value={query}
                onChange={e => onInput(e.target.value)}
                onKeyDown={e => { if(e.key==='Enter') doSearch(); if(e.key==='Escape') setShowDrop(false) }}
                onFocus={() => suggestions.length && setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                placeholder="Enter Room Number (e.g. C007)"
                autoComplete="off"
              />
              {showDrop && (
                <div style={{position:'absolute',top:'105%',left:0,right:0,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,zIndex:100,boxShadow:'0 4px 16px rgba(0,0,0,.18)',maxHeight:260,overflowY:'auto'}}>
                  {suggestions.map(r => (
                    <div key={r} onMouseDown={() => pick(r)}
                      style={{padding:'9px 14px',cursor:'pointer',fontSize:13,borderBottom:'1px solid var(--border)',fontWeight:700,color:'var(--text)'}}>
                      {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="btn btn-primary" onClick={() => doSearch()} disabled={searching}>
              {searching ? 'Searching…' : 'View Schedule'}
            </button>
          </div>

          {/* ── Timetable grid ─────────────────────────────────────────── */}
          {schedule && (
            <div>
              <div style={{fontWeight:800,fontSize:'1.2rem',color:'var(--brand)',marginBottom:12}}>
                Weekly Schedule — <span style={{color:'var(--text)'}}>{searchedRoom}</span>
              </div>
              <div style={{overflowX:'auto',borderRadius:8,border:'1px solid var(--border)'}}>
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
                  <thead>
                    <tr style={{background:'var(--surface-2)'}}>
                      <th style={thSt}>Day</th>
                      {Array.from({length:MAX_PERIOD},(_,i)=>i+1).map(p => (
                        <th key={p} style={thSt}>P{p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {BOX_DAY_KEYS.map(dk => {
                      const dayData = schedule[dk] || {}
                      const hasAny  = Object.keys(dayData).length > 0
                      return (
                        <tr key={dk} style={{borderBottom:'1px solid var(--border)',opacity:hasAny?1:0.45}}>
                          <td style={{padding:'8px 12px',fontWeight:700,fontSize:13,whiteSpace:'nowrap',color:'var(--text-2)'}}>{BOX_DAY_NAMES[dk]}</td>
                          {Array.from({length:MAX_PERIOD},(_,i)=>i+1).map(p => {
                            const cell = dayData[p]
                            return (
                              <td key={p} style={{
                                padding:'6px 8px',
                                fontSize:11,
                                textAlign:'center',
                                verticalAlign:'middle',
                                background: cell ? 'var(--surface-2)' : 'transparent',
                                color: cell ? 'var(--text)' : 'var(--text-3)',
                                fontWeight: cell ? 600 : 400,
                                border:'1px solid var(--border)',
                                minWidth:80,
                                lineHeight:1.3,
                              }}>
                                {cell || '—'}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
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
          <div style={{marginBottom:16}}>
            <h3 style={{fontSize:'1.3rem',fontWeight:800,color:'var(--brand)',margin:0}}>
              Analytics for <span style={{color:'var(--text)'}}>{data.room}</span>
              <span style={{fontSize:13,color:'var(--text-3)',fontWeight:400,marginLeft:10}}>(Capacity: {data.capacity||'?'})</span>
            </h3>
            <ErpBadges sections={data.erp_sections}/>
          </div>
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

      <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:'2px solid var(--border)',flexWrap:'wrap'}}>
        {[{id:'find',label:'🔍 Find Free Rooms'},{id:'stats',label:'📊 All Rooms Stats'},{id:'analytics',label:'🔬 Analytics Search'},{id:'lookup',label:'🏷️ Room Search'},{id:'boxtt',label:'📋 Box TT Converter'}].map(t=>(
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
      {tab==='lookup'    && <RoomSearchTab/>}
      {tab==='boxtt'     && <BoxTTTab/>}
    </PortalShell>
  )
}

export default function FreeRoomsPage() {
  return <AuthProvider><FreeRoomsContent/></AuthProvider>
}
