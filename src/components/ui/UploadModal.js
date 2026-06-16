'use client'
import { useState, useEffect } from 'react'
import Papa from 'papaparse'
import { useApi } from '@/components/AuthContext'
import toast from 'react-hot-toast'
import { X, UploadCloud, Trash2, RefreshCw } from 'lucide-react'
import ColMappingPreview from '@/components/ui/ColMappingPreview'

export default function UploadModal({ onClose }) {
  const { postForm, get, del } = useApi()
  const [files, setFiles]             = useState({ timetable: null, rooms: null, master: null })
  const [colPreview, setColPreview]   = useState(null)
  const [loading, setLoading]         = useState(false)
  const [status, setStatus]           = useState(null)
  const [uploadResult, setUploadResult] = useState(null)

  const fetchStatus = async () => {
    const d = await get('/api/upload/status')
    if (d.success) setStatus(d.status)
  }

  useEffect(() => { fetchStatus() }, [])

  const handleTimetableFile = (e) => {
    const file = e.target.files[0] || null
    setFiles(f => ({ ...f, timetable: file }))
    setColPreview(null)
    setUploadResult(null)
    if (!file) return

    // Parse first 2 rows in-browser to get headers + sample values
    Papa.parse(file, {
      header: true,
      preview: 2,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
      complete: ({ data, meta }) => {
        setColPreview({ headers: meta.fields || [], firstRow: data[0] || {} })
      },
    })
  }

  const handleFile = (key) => (e) => {
    setFiles(f => ({ ...f, [key]: e.target.files[0] || null }))
    setUploadResult(null)
  }

  const upload = async () => {
    if (!files.timetable && !files.rooms && !files.master)
      return toast.error('Select at least one file')

    setLoading(true)
    try {
      const fd = new FormData()
      if (files.timetable) fd.append('timetable', files.timetable)
      if (files.rooms)     fd.append('rooms',     files.rooms)
      if (files.master)    fd.append('master',    files.master)

      const d = await postForm('/api/upload', fd)
      if (!d.success) throw new Error(d.message)

      setUploadResult(d.results)
      for (const [key, r] of Object.entries(d.results)) {
        if (r.error) toast.error(`${key}: ${r.error}`)
        else toast.success(`${key}: ${r.inserted ?? (r.upserted ?? 0) + (r.modified ?? 0)} rows loaded`)
      }

      setFiles({ timetable: null, rooms: null, master: null })
      setColPreview(null)
      await fetchStatus()
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  const clearData = async (dataset) => {
    if (!confirm(`Clear ${dataset} data? This cannot be undone.`)) return
    const d = await del(`/api/upload/status?dataset=${dataset}`)
    if (d.success) { toast.success(d.message); fetchStatus() }
    else toast.error(d.message)
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.55)',
      zIndex:2000, display:'flex', justifyContent:'center', alignItems:'center', padding:16,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card fade-up" style={{ width:'100%', maxWidth:560, padding:28, maxHeight:'90vh', overflowY:'auto' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ margin:0, fontFamily:"'DM Serif Display',serif", color:'var(--brand)' }}>
            Manage Data Files
          </h2>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Status banner */}
        {status && (
          <div style={{
            background:'var(--surface-2)', border:'1px solid var(--border)',
            borderRadius:8, padding:'10px 14px', marginBottom:20, fontSize:13,
            display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6,
          }}>
            <div><span style={{ color:'var(--text-3)' }}>Live rows</span><br /><b>{status.live.toLocaleString()}</b></div>
            <div><span style={{ color:'var(--text-3)' }}>Master rows</span><br /><b>{status.master.toLocaleString()}</b></div>
            <div><span style={{ color:'var(--text-3)' }}>Rooms</span><br /><b>{status.rooms.toLocaleString()}</b></div>
          </div>
        )}

        {/* 1. Live Timetable CSV with column mapping preview */}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:'block', fontWeight:600, fontSize:13.5, marginBottom:4, color:'var(--text)' }}>
            1. Live Timetable CSV
          </label>
          <p style={{ margin:'0 0 6px', fontSize:12, color:'var(--text-3)' }}>BTT-XXXXXX.csv — main schedule</p>
          <input
            type="file" accept=".csv,.CSV"
            onChange={handleTimetableFile}
            style={{
              width:'100%', padding:'8px 10px', border:'1.5px dashed var(--border)',
              borderRadius:8, background:'var(--surface-2)', color:'var(--text)',
              fontSize:13, cursor:'pointer',
            }}
          />
          {files.timetable && (
            <p style={{ margin:'4px 0 0', fontSize:12, color:'#16a34a' }}>✓ {files.timetable.name}</p>
          )}
          {colPreview && <ColMappingPreview preview={colPreview} />}
        </div>

        {/* 2. Room Data CSV */}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:'block', fontWeight:600, fontSize:13.5, marginBottom:4, color:'var(--text)' }}>
            2. Room Data CSV
          </label>
          <p style={{ margin:'0 0 6px', fontSize:12, color:'var(--text-3)' }}>KLEF-ERP-RD.csv — room metadata</p>
          <input
            type="file" accept=".csv,.CSV"
            onChange={handleFile('rooms')}
            style={{
              width:'100%', padding:'8px 10px', border:'1.5px dashed var(--border)',
              borderRadius:8, background:'var(--surface-2)', color:'var(--text)',
              fontSize:13, cursor:'pointer',
            }}
          />
          {files.rooms && (
            <p style={{ margin:'4px 0 0', fontSize:12, color:'#16a34a' }}>✓ {files.rooms.name}</p>
          )}
        </div>

        {/* 3. Master Timetable */}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:'block', fontWeight:600, fontSize:13.5, marginBottom:4, color:'var(--brand)' }}>
            3. Master Timetable (optional)
          </label>
          <p style={{ margin:'0 0 6px', fontSize:12, color:'var(--text-3)' }}>For clash cross-check. If not uploaded, clash runs on live data.</p>
          <input
            type="file" accept=".csv,.CSV"
            onChange={handleFile('master')}
            style={{
              width:'100%', padding:'8px 10px', border:'1.5px dashed var(--border)',
              borderRadius:8, background:'var(--surface-2)', color:'var(--text)',
              fontSize:13, cursor:'pointer',
            }}
          />
          {files.master && (
            <p style={{ margin:'4px 0 0', fontSize:12, color:'#16a34a' }}>✓ {files.master.name}</p>
          )}
        </div>

        {/* Upload result & parse warnings */}
        {uploadResult && (
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:4 }}>
            {Object.entries(uploadResult).map(([key, r]) => {
              const hasWarnings = r.warnings?.length > 0
              const isError = !!r.error
              return (
                <div key={key} style={{
                  borderRadius:8, padding:'10px 14px', fontSize:13,
                  border: `1.5px solid ${isError ? '#ef4444' : hasWarnings ? '#f59e0b' : '#16a34a'}`,
                  background: isError ? '#fef2f2' : hasWarnings ? '#fffbeb' : '#f0fdf4',
                  color: isError ? '#991b1b' : hasWarnings ? '#92400e' : '#15803d',
                }}>
                  <div style={{ fontWeight:700, marginBottom: hasWarnings ? 6 : 0 }}>
                    {key.toUpperCase()}: {isError
                      ? `Error — ${r.error}`
                      : `${r.inserted ?? (r.upserted ?? 0) + (r.modified ?? 0)} rows loaded`}
                  </div>
                  {hasWarnings && (
                    <ul style={{ margin:'4px 0 0', paddingLeft:18 }}>
                      {r.warnings.map((w, i) => <li key={i} style={{ marginBottom:2 }}>{w}</li>)}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:20 }}>
          <button className="btn btn-primary" onClick={upload} disabled={loading} style={{ flex:1 }}>
            <UploadCloud size={16} />
            {loading ? 'Uploading…' : 'Upload & Update'}
          </button>
          <button className="btn btn-danger" onClick={() => clearData('all')}>
            <Trash2 size={15} />
            Clear All
          </button>
          <button className="btn btn-ghost" onClick={fetchStatus}>
            <RefreshCw size={15} />
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>

        {/* Per-dataset clear */}
        <div style={{ marginTop:16, display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-ghost" style={{ fontSize:12, padding:'6px 12px' }}
            onClick={() => clearData('live')}>
            Clear Live
          </button>
          <button className="btn btn-ghost" style={{ fontSize:12, padding:'6px 12px' }}
            onClick={() => clearData('master')}>
            Clear Master
          </button>
        </div>
      </div>
    </div>
  )
}
