'use client'
import { useState, useEffect, useCallback } from 'react'
import { useApi, useAuth } from '@/components/AuthContext'
import toast from 'react-hot-toast'

const DAY_COLS = ['mon','tue','wed','thu','fri','sat']
const DAY_LABELS = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat' }
const TYPE_COLORS = {
  CR: { bg:'#dbeafe', color:'#1e40af' },
  LAB: { bg:'#d1fae5', color:'#065f46' },
  HLAB: { bg:'#fef3c7', color:'#92400e' },
  STUDIO: { bg:'#ede9fe', color:'#5b21b6' },
  SPORTS: { bg:'#fce7f3', color:'#9d174d' },
  Activity: { bg:'#e0f2fe', color:'#075985' },
  SHALL: { bg:'#f1f5f9', color:'#475569' },
}

function TypeBadge({ type }) {
  const s = TYPE_COLORS[type] || { bg:'var(--surface-2)', color:'var(--text-3)' }
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4, background:s.bg, color:s.color, whiteSpace:'nowrap' }}>
      {type || '—'}
    </span>
  )
}

function EditModal({ room, onSave, onClose }) {
  const [form, setForm] = useState({ ...room })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:3000,
      display:'flex', justifyContent:'center', alignItems:'center', padding:16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width:'100%', maxWidth:560, padding:24, maxHeight:'90vh', overflowY:'auto' }}>
        <h3 style={{ margin:'0 0 16px', fontFamily:"'DM Serif Display',serif", color:'var(--brand)' }}>
          Edit Room — {room.roomNo}
        </h3>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'var(--text-3)', display:'block', marginBottom:3 }}>Block</label>
            <input className="input" style={{ width:'100%' }} value={form.block||''} onChange={e=>set('block',e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'var(--text-3)', display:'block', marginBottom:3 }}>Floor</label>
            <input className="input" style={{ width:'100%' }} type="number" value={form.floor??''} onChange={e=>set('floor',e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'var(--text-3)', display:'block', marginBottom:3 }}>Capacity</label>
            <input className="input" style={{ width:'100%' }} type="number" value={form.capacity||''} onChange={e=>set('capacity',e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'var(--text-3)', display:'block', marginBottom:3 }}>Type</label>
            <select className="input" style={{ width:'100%' }} value={form.type||''} onChange={e=>set('type',e.target.value)}>
              {['CR','LAB','HLAB','STUDIO','SPORTS','Activity','SHALL',''].map(t => <option key={t} value={t}>{t||'—'}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, fontWeight:700, color:'var(--text-3)', display:'block', marginBottom:6 }}>Day Allocations</label>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {DAY_COLS.map(d => (
              <div key={d}>
                <label style={{ fontSize:11, color:'var(--text-3)', fontWeight:600, display:'block', marginBottom:2 }}>{DAY_LABELS[d]}</label>
                <input className="input" style={{ width:'100%', fontSize:12 }} value={form[d]||''} onChange={e=>set(d,e.target.value)} placeholder="e.g. II ENGG" />
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, fontWeight:700, color:'var(--text-3)', display:'block', marginBottom:3 }}>Notes</label>
          <textarea className="input" style={{ width:'100%', minHeight:64, resize:'vertical', fontSize:13 }}
            value={form.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="Any notes about this room…" />
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={() => onSave(form)}>Save Changes</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function RoomAllocationTab() {
  const { get, patch } = useApi()
  const { isAdmin } = useAuth()

  const [rooms,    setRooms]    = useState([])
  const [blocks,   setBlocks]   = useState([])
  const [types,    setTypes]    = useState([])
  const [wings,    setWings]    = useState([])
  const [loading,  setLoading]  = useState(false)
  const [editing,  setEditing]  = useState(null)

  // Filters
  const [q,       setQ]       = useState('')
  const [fBlock,  setFBlock]  = useState('')
  const [fFloor,  setFFloor]  = useState('')
  const [fType,   setFType]   = useState('')
  const [fWing,   setFWing]   = useState('')
  const [fStatus, setFStatus] = useState('')

  const fetchRooms = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q)       params.set('q',       q)
    if (fBlock)  params.set('block',   fBlock)
    if (fFloor)  params.set('floor',   fFloor)
    if (fType)   params.set('type',    fType)
    if (fWing)   params.set('coeMhs',  fWing)
    if (fStatus) params.set('status',  fStatus)
    const d = await get(`/api/room-allocation?${params}`)
    if (d.success) {
      setRooms(d.rooms)
      setBlocks(d.blocks || [])
      setTypes(d.types || [])
      setWings(d.wings || [])
    }
    setLoading(false)
  }, [q, fBlock, fFloor, fType, fWing, fStatus])

  useEffect(() => { fetchRooms() }, [fetchRooms])

  const toggleStatus = async (room) => {
    const newStatus = room.status === 'completed' ? 'free' : 'completed'
    const d = await patch('/api/room-allocation', { id: room._id, status: newStatus })
    if (d.success) {
      setRooms(rs => rs.map(r => r._id === room._id ? { ...r, status: newStatus } : r))
    } else toast.error(d.message)
  }

  const saveEdit = async (form) => {
    const d = await patch('/api/room-allocation', {
      id: form._id,
      notes: form.notes, capacity: form.capacity, type: form.type,
      mon: form.mon, tue: form.tue, wed: form.wed,
      thu: form.thu, fri: form.fri, sat: form.sat,
    })
    if (d.success) {
      setRooms(rs => rs.map(r => r._id === form._id ? { ...r, ...d.room } : r))
      setEditing(null)
      toast.success('Room updated')
    } else toast.error(d.message)
  }

  const completedCount = rooms.filter(r => r.status === 'completed').length
  const total = rooms.length

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <div style={{ padding:'8px 16px', borderRadius:8, background:'var(--surface-2)',
          border:'1px solid var(--border)', fontSize:13 }}>
          Total: <strong>{total}</strong>
        </div>
        <div style={{ padding:'8px 16px', borderRadius:8, background:'#f0fdf4',
          border:'1px solid #16a34a', fontSize:13, color:'#15803d' }}>
          ✓ Completed: <strong>{completedCount}</strong>
        </div>
        <div style={{ padding:'8px 16px', borderRadius:8, background:'#fef2f2',
          border:'1px solid #ef4444', fontSize:13, color:'#991b1b' }}>
          ○ Pending: <strong>{total - completedCount}</strong>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12,
        padding:'12px 14px', background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)' }}>
        <input
          className="input" style={{ flex:2, minWidth:160, fontSize:13 }}
          placeholder="Search room no, allocation…"
          value={q} onChange={e => setQ(e.target.value)}
        />
        <select className="input" style={{ flex:1, minWidth:100, fontSize:13 }} value={fBlock} onChange={e=>setFBlock(e.target.value)}>
          <option value="">All Blocks</option>
          {blocks.filter(Boolean).map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="input" style={{ flex:1, minWidth:90, fontSize:13 }} value={fFloor} onChange={e=>setFFloor(e.target.value)}>
          <option value="">All Floors</option>
          {[...new Set(rooms.map(r => r.floor))].sort((a,b)=>a-b).map(f => <option key={f} value={f}>Floor {f}</option>)}
        </select>
        <select className="input" style={{ flex:1, minWidth:90, fontSize:13 }} value={fType} onChange={e=>setFType(e.target.value)}>
          <option value="">All Types</option>
          {types.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input" style={{ flex:1, minWidth:90, fontSize:13 }} value={fWing} onChange={e=>setFWing(e.target.value)}>
          <option value="">All Wings</option>
          {wings.filter(Boolean).map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <select className="input" style={{ flex:1, minWidth:100, fontSize:13 }} value={fStatus} onChange={e=>setFStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="free">Pending</option>
          <option value="completed">Completed</option>
        </select>
        <button className="btn btn-ghost" style={{ fontSize:12 }}
          onClick={() => { setQ(''); setFBlock(''); setFFloor(''); setFType(''); setFWing(''); setFStatus('') }}>
          Clear
        </button>
      </div>

      {loading && <div style={{ textAlign:'center', padding:40, color:'var(--text-3)' }}>Loading…</div>}

      {!loading && rooms.length === 0 && (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-3)', fontSize:14 }}>
          {total === 0 ? 'No room allocation data uploaded yet. Upload via Admin → Room Allocation.' : 'No rooms match the current filters.'}
        </div>
      )}

      {!loading && rooms.length > 0 && (
        <div style={{ overflowX:'auto', borderRadius:10, border:'1px solid var(--border)' }}>
          <table className="tt-table" style={{ fontSize:12, minWidth:900 }}>
            <thead>
              <tr>
                <th style={{ width:32 }}>#</th>
                <th>Room No</th>
                <th>Block</th>
                <th>Floor</th>
                <th>Capacity</th>
                <th>Mon</th>
                <th>Tue</th>
                <th>Wed</th>
                <th>Thu</th>
                <th>Fri</th>
                <th>Sat</th>
                <th>Type</th>
                <th>Wing</th>
                <th>Notes</th>
                <th style={{ width: isAdmin ? 140 : 80 }}>Status</th>
                {isAdmin && <th style={{ width:60 }}>Edit</th>}
              </tr>
            </thead>
            <tbody>
              {rooms.map((r, i) => (
                <tr key={r._id} style={{
                  background: r.status === 'completed' ? 'rgba(22,163,74,.06)' : 'transparent',
                  opacity: r.status === 'completed' ? 0.75 : 1,
                }}>
                  <td style={{ color:'var(--text-3)', fontSize:11 }}>{r.slNo || i+1}</td>
                  <td style={{ fontWeight:700, color:'var(--brand)', whiteSpace:'nowrap' }}>{r.roomNo}</td>
                  <td>{r.block}</td>
                  <td style={{ textAlign:'center' }}>{r.floor}</td>
                  <td style={{ textAlign:'center' }}>{r.capacity || '—'}</td>
                  {DAY_COLS.map(d => (
                    <td key={d} style={{ fontSize:11, color: r[d] ? 'var(--text)' : 'var(--text-3)',
                      fontStyle: r[d] ? 'normal' : 'italic', whiteSpace:'nowrap' }}>
                      {r[d] || '—'}
                    </td>
                  ))}
                  <td><TypeBadge type={r.type} /></td>
                  <td style={{ fontSize:11, color:'var(--text)' }}>{r.coeMhs || '—'}</td>
                  <td style={{ fontSize:11, color:'var(--text-3)', maxWidth:120, overflow:'hidden',
                    textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.notes}>{r.notes || '—'}</td>
                  <td>
                    {isAdmin ? (
                      <button
                        onClick={() => toggleStatus(r)}
                        style={{
                          fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:20,
                          border: 'none', cursor:'pointer', whiteSpace:'nowrap',
                          background: r.status === 'completed' ? '#16a34a' : 'var(--surface-3,var(--border))',
                          color: r.status === 'completed' ? '#fff' : 'var(--text-2)',
                        }}>
                        {r.status === 'completed' ? '✓ Completed' : '○ Mark Done'}
                      </button>
                    ) : (
                      <span style={{ fontSize:11, fontWeight:600,
                        color: r.status === 'completed' ? '#16a34a' : 'var(--text-3)' }}>
                        {r.status === 'completed' ? '✓ Completed' : '—'}
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td>
                      <button className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => setEditing(r)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditModal room={editing} onSave={saveEdit} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
