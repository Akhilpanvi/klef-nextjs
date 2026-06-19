'use client'
import { useState, useEffect, useRef } from 'react'
import { useApi } from '@/components/AuthContext'
import toast from 'react-hot-toast'

export default function RoomAllocationUploadCard() {
  const { get, postForm } = useApi()
  const fileRef = useRef(null)

  const [roomCount, setRoomCount] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [file,      setFile]      = useState(null)
  const [result,    setResult]    = useState(null)

  useEffect(() => { fetchCount() }, [])

  const fetchCount = async () => {
    setLoading(true)
    try {
      const d = await get('/api/room-allocation')
      setRoomCount(d.success ? d.rooms.length : null)
    } catch { setRoomCount(null) }
    finally { setLoading(false) }
  }

  const downloadSample = () => {
    window.open('/api/admin/upload-room-allocation', '_blank')
  }

  const upload = async () => {
    if (!file) return toast.error('Select a Room Allocation CSV file first')
    setUploading(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const data = await postForm('/api/admin/upload-room-allocation', form)
      if (!data.success) throw new Error(data.message)
      setResult({ ok: true, inserted: data.inserted })
      toast.success(`Uploaded — ${data.inserted} rooms inserted`)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      fetchCount()
    } catch (err) {
      setResult({ ok: false, message: err.message })
      toast.error(err.message)
    } finally { setUploading(false) }
  }

  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 20, marginBottom: 24,
      gridColumn: 'span 2',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🏢 Room Allocation Data</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Upload room allocation CSV to populate the Room Allocation tab under Free Rooms.<br />
            Required columns: <strong>SL NO, BLOCK, FLOOR, ROOM NO, ROOM CAPACITY, MON, TUE, WED, THU, FRI, SAT, TYPE, COE/MHS</strong>
          </div>
        </div>
        <button
          className="btn btn-ghost"
          onClick={downloadSample}
          style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}>
          ⬇ Sample CSV
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>Checking status…</div>
      ) : roomCount !== null && roomCount > 0 ? (
        <div style={{
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14,
        }}>
          <span style={{ color: '#10b981', fontWeight: 700 }}>✅ Active: </span>
          <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>
            {roomCount.toLocaleString()} rooms in database
          </span>
        </div>
      ) : (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14,
          color: '#ef4444',
        }}>
          ⚠️ No room allocation data uploaded yet
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={e => { setFile(e.target.files?.[0] || null); setResult(null) }}
          className="input"
          style={{ flex: 1, minWidth: 200, fontSize: 13 }}
        />
        <button
          className="btn btn-primary"
          onClick={upload}
          disabled={uploading || !file}
          style={{ whiteSpace: 'nowrap' }}>
          {uploading ? 'Uploading…' : roomCount ? '↑ Replace' : '↑ Upload'}
        </button>
      </div>

      {file && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
          Selected: {file.name} ({(file.size / 1024).toFixed(0)} KB)
        </div>
      )}

      {result && (
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13,
          background: result.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${result.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: result.ok ? '#10b981' : '#ef4444',
        }}>
          {result.ok
            ? `✅ Successfully inserted ${result.inserted} rooms`
            : `❌ ${result.message}`}
        </div>
      )}
    </div>
  )
}
