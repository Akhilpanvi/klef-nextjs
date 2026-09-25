'use client'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '@/components/AuthContext'
import toast from 'react-hot-toast'

export default function RoomAssignmentUploadCard() {
  const { get, postForm, del } = useApi()
  const inputRef = useRef(null)
  const [status, setStatus] = useState(null)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [result, setResult] = useState(null)

  const fetchStatus = async () => {
    setLoading(true)
    try { setStatus(await get('/api/admin/room-assignments')) }
    catch { setStatus(null) }
    finally { setLoading(false) }
  }
  useEffect(() => { fetchStatus() }, [])

  const upload = async () => {
    if (!file) return toast.error('Select the room assignment CSV/XLSX file')
    setUploading(true); setResult(null)
    try {
      const form = new FormData()
      form.append('assignment', file)
      const data = await postForm('/api/admin/room-assignments', form)
      if (!data.success) throw new Error(data.message)
      setResult(data)
      toast.success(`Assignments updated for ${data.inserted} approved rooms`)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      await fetchStatus()
    } catch (error) { toast.error(error.message) }
    finally { setUploading(false) }
  }

  const clear = async () => {
    if (!confirm('Clear the uploaded room assignments and restore the bundled assignment file?')) return
    setClearing(true)
    try {
      const data = await del('/api/admin/room-assignments')
      if (!data.success) throw new Error(data.message)
      toast.success('Uploaded assignments cleared; bundled assignments restored')
      setResult(null)
      await fetchStatus()
    } catch (error) { toast.error(error.message) }
    finally { setClearing(false) }
  }

  return <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Room Department Assignments</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
          Upload CSV/XLSX to update Assigned and Monday–Saturday values throughout Free Rooms.<br />
          Required columns: <strong>ROOM NO, ASSIGNED, MON, TUE, WED, THU, FRI, SAT</strong>.
        </div>
      </div>
      {status?.active && <button className="btn btn-danger" onClick={clear} disabled={clearing} style={{ alignSelf: 'flex-start' }}>
        {clearing ? 'Clearing…' : 'Clear upload'}
      </button>}
    </div>

    {loading ? <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>Checking status…</div>
      : status?.active ? <div style={{ background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
        <strong style={{ color: '#10b981' }}>Active:</strong> {status.filename} · {status.matchedCount} approved rooms matched
        · {status.missingCount} without a match · uploaded {new Date(status.uploadedAt).toLocaleString()}
      </div> : <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
        Bundled assignment data is active. Upload a file here to update the portal without redeployment.
      </div>}

    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="input" style={{ flex: 1, minWidth: 220 }}
        onChange={event => { setFile(event.target.files?.[0] || null); setResult(null) }} />
      <button className="btn btn-primary" disabled={!file || uploading} onClick={upload}>
        {uploading ? 'Uploading…' : status?.active ? 'Replace assignments' : 'Upload assignments'}
      </button>
    </div>
    {file && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 7 }}>Selected: {file.name}</div>}
    {result && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
      Updated {result.inserted} rooms. {result.missingCount} approved rooms have no exact match; {result.unmatchedCount} workbook names were ignored.
      {!!result.missingRooms?.length && <details><summary style={{ cursor: 'pointer' }}>Show approved rooms without matches</summary><div>{result.missingRooms.join(', ')}</div></details>}
      {!!result.unmatchedRooms?.length && <details><summary style={{ cursor: 'pointer' }}>Show ignored workbook room names</summary><div>{result.unmatchedRooms.join(', ')}</div></details>}
    </div>}
  </div>
}
