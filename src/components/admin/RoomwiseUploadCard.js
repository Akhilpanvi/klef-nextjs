'use client'
/**
 * RoomwiseUploadCard
 * ──────────────────
 * Drop this component anywhere in your admin page.
 * Handles upload, status check and clear of Roomwise-TT CSV.
 *
 * Usage:
 *   import RoomwiseUploadCard from '@/components/admin/RoomwiseUploadCard'
 *   <RoomwiseUploadCard />
 */
import { useState, useEffect, useRef } from 'react'
import { useApi } from '@/components/AuthContext'
import toast from 'react-hot-toast'

export default function RoomwiseUploadCard() {
  const { get, del, postForm } = useApi()
  const fileRef = useRef(null)

  const [status,    setStatus]    = useState(null)   // current snapshot info
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [clearing,  setClearing]  = useState(false)
  const [file,      setFile]      = useState(null)

  useEffect(() => { fetchStatus() }, [])

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const d = await get('/api/admin/roomwise')
      setStatus(d.active ? d : null)
    } catch { setStatus(null) }
    finally { setLoading(false) }
  }

  const upload = async () => {
    if (!file) return toast.error('Select a Roomwise-TT CSV file first')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('roomwise', file)
      const data = await postForm('/api/admin/roomwise', form)
      if (!data.success) throw new Error(data.message)
      toast.success(`Uploaded — ${data.inserted} slot entries`)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      fetchStatus()
    } catch (err) { toast.error(err.message) }
    finally { setUploading(false) }
  }

  const clear = async () => {
    if (!confirm('Clear Roomwise TT data? Free rooms finder will stop working until re-uploaded.')) return
    setClearing(true)
    try {
      const data = await del('/api/admin/roomwise')
      if (!data.success) throw new Error(data.message)
      toast.success('Roomwise TT data cleared')
      setStatus(null)
    } catch (err) { toast.error(err.message) }
    finally { setClearing(false) }
  }

  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 20, marginBottom: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🏫 Roomwise Timetable</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Upload Roomwise-TT-xx.xx.xxxx.csv for free room analysis.<br />
            Can be cleared and re-uploaded anytime — old data is not kept.
          </div>
        </div>
        {status && (
          <button className="btn btn-danger" onClick={clear} disabled={clearing}
            style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}>
            {clearing ? 'Clearing…' : '🗑 Clear'}
          </button>
        )}
      </div>

      {/* Current status */}
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
            ({status.rowCount?.toLocaleString()} entries)
          </span>
        </div>
      ) : (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14,
          color: '#ef4444',
        }}>
          ⚠️ No Roomwise TT uploaded — free room finder is inactive
        </div>
      )}

      {/* Upload form */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={e => setFile(e.target.files?.[0] || null)}
          className="input"
          style={{ flex: 1, minWidth: 200, fontSize: 13 }}
        />
        <button
          className="btn btn-primary"
          onClick={upload}
          disabled={uploading || !file}
          style={{ whiteSpace: 'nowrap' }}
        >
          {uploading ? 'Uploading…' : status ? '↑ Replace' : '↑ Upload'}
        </button>
      </div>
      {file && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
          Selected: {file.name} ({(file.size / 1024).toFixed(0)} KB)
        </div>
      )}
    </div>
  )
}
