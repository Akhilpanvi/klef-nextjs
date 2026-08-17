'use client'
/**
 * FacultywiseUploadCard
 * ─────────────────────
 * Upload / status / clear for the Faculty-wise TT grid.
 *
 * One file per faculty row with a column per day+period; each busy cell names
 * the room, so this single upload drives both free-faculty and free-room
 * lookups, and the two can never disagree.
 */
import { useState, useEffect, useRef } from 'react'
import { useApi } from '@/components/AuthContext'
import toast from 'react-hot-toast'

export default function FacultywiseUploadCard() {
  const { get, del, postForm } = useApi()
  const fileRef = useRef(null)

  const [status,    setStatus]    = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [clearing,  setClearing]  = useState(false)
  const [file,      setFile]      = useState(null)
  const [result,    setResult]    = useState(null)

  useEffect(() => { fetchStatus() }, [])

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const d = await get('/api/admin/facultywise')
      setStatus(d.active ? d : null)
    } catch { setStatus(null) }
    finally { setLoading(false) }
  }

  const upload = async () => {
    if (!file) return toast.error('Select a Faculty-wise TT file first')
    setUploading(true); setResult(null)
    try {
      const form = new FormData()
      form.append('facultywise', file)
      const d = await postForm('/api/admin/facultywise', form)
      if (!d.success) { setResult(d); throw new Error(d.message) }
      setResult(d)
      toast.success(`Uploaded — ${d.facultyCount} faculty, ${d.inserted} busy slots`)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      fetchStatus()
    } catch (err) { toast.error(err.message) }
    finally { setUploading(false) }
  }

  const clear = async () => {
    if (!confirm('Clear Faculty-wise TT data? Lookups that use it will stop working until re-uploaded.')) return
    setClearing(true)
    try {
      const d = await del('/api/admin/facultywise')
      if (!d.success) throw new Error(d.message)
      toast.success('Faculty-wise TT data cleared')
      setStatus(null); setResult(null)
    } catch (err) { toast.error(err.message) }
    finally { setClearing(false) }
  }

  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 20, marginBottom: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>👩‍🏫 Faculty-wise Timetable</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            One row per faculty, one column per day &amp; period (<code>mon 1</code> … <code>sat 11</code>).
            Busy cells hold <code>Room No / Degree / Offering Level / Course Code / Delivery Component / Section</code>;
            free cells hold <code>-</code>.<br />
            Because every busy cell names its room, this one file gives both free faculty and free rooms.
          </div>
        </div>
        {status && (
          <button className="btn btn-danger" onClick={clear} disabled={clearing}
            style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}>
            {clearing ? 'Clearing…' : '🗑 Clear'}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Checking status…</div>
      ) : status ? (
        <div style={{
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14,
        }}>
          <span style={{ color: '#10b981', fontWeight: 700 }}>✅ Active: </span>
          <span>{status.label}</span>
          <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>
            ({status.facultyCount?.toLocaleString()} faculty · {status.rowCount?.toLocaleString()} busy slots)
          </span>
        </div>
      ) : (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14, color: '#b45309',
        }}>
          ⚠️ No Faculty-wise TT uploaded yet
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={e => { setFile(e.target.files?.[0] || null); setResult(null) }}
          className="input"
          style={{ flex: 1, minWidth: 200, fontSize: 13 }}
        />
        <button className="btn btn-primary" onClick={upload} disabled={uploading || !file}
          style={{ whiteSpace: 'nowrap' }}>
          {uploading ? 'Uploading…' : status ? '↑ Replace' : '↑ Upload'}
        </button>
      </div>
      {file && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
          Selected: {file.name} ({(file.size / 1024).toFixed(0)} KB)
        </div>
      )}

      {result && (
        <div style={{ marginTop: 12, fontSize: 12 }}>
          {result.slotColumns != null && (
            <div style={{ color: 'var(--text-3)' }}>
              {result.slotColumns} day/period columns recognised
              {result.facultyCount != null && ` · ${result.facultyCount} faculty rows`}
            </div>
          )}
          {result.warnings?.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#b45309' }}>
              {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          {result.detectedColumns?.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-3)' }}>
                Columns detected ({result.detectedColumns.length})
              </summary>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-3)', marginTop: 4, wordBreak: 'break-word' }}>
                {result.detectedColumns.filter(Boolean).join(' · ')}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
