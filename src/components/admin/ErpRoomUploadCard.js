'use client'
import { useState, useEffect, useRef } from 'react'
import { useApi } from '@/components/AuthContext'
import toast from 'react-hot-toast'

export default function ErpRoomUploadCard() {
  const { get, del, postForm } = useApi()
  const fileRef = useRef(null)

  const [status,    setStatus]    = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [clearing,  setClearing]  = useState(false)
  const [file,      setFile]      = useState(null)

  useEffect(() => { fetchStatus() }, [])

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const d = await get('/api/admin/erproom')
      setStatus(d.active ? d : null)
    } catch { setStatus(null) }
    finally { setLoading(false) }
  }

  const upload = async () => {
    if (!file) return toast.error('Select an ERP-ROOMDATA CSV/XLSX file first')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('erproom', file)
      const data = await postForm('/api/admin/erproom', form)
      if (!data.success) throw new Error(data.message)
      toast.success(`Uploaded — ${data.inserted} rooms`)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      fetchStatus()
    } catch (err) { toast.error(err.message) }
    finally { setUploading(false) }
  }

  const clear = async () => {
    if (!confirm('Clear ERP Room Data? Room IDs will no longer show in free rooms finder.')) return
    setClearing(true)
    try {
      const data = await del('/api/admin/erproom')
      if (!data.success) throw new Error(data.message)
      toast.success('ERP Room Data cleared')
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
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🏷️ ERP Room Data</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Upload ERP-ROOMDATA CSV/XLSX to show ERP Room IDs in the free rooms finder.<br />
            Sections (A/B/C/D/MA) are grouped under their base room number.
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
          <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>
            {status.roomCount?.toLocaleString()} rooms with ERP IDs
          </span>
        </div>
      ) : (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14,
          color: '#ef4444',
        }}>
          ⚠️ No ERP Room Data uploaded — ERP IDs will not appear in free rooms finder
        </div>
      )}

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
