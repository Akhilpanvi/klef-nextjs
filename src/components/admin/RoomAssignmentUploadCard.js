'use client'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '@/components/AuthContext'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const SAMPLE_ROWS = [
  { 'SL NO': 1, FLOOR: 0, 'ROOM NO': 'C007', BLOCK: 'C', 'ROOM CAPACITY': 72, TYPE: 'CR', ASSIGNED: 'CLASS', MON: 'II PBL', TUE: 'II PBL', WED: 'II PBL', THU: 'I PBL', FRI: 'II PBL', SAT: 'II PBL' },
  { 'SL NO': 2, FLOOR: 0, 'ROOM NO': 'C008', BLOCK: 'C', 'ROOM CAPACITY': 72, TYPE: 'CR', ASSIGNED: 'CLASS', MON: 'I PBL', TUE: 'I PBL', WED: 'I PBL', THU: 'I PBL', FRI: 'I PBL', SAT: 'I PBL' },
  { 'SL NO': 3, FLOOR: 0, 'ROOM NO': 'C017', BLOCK: 'C', 'ROOM CAPACITY': 72, TYPE: 'CR', ASSIGNED: 'CLASS', MON: 'II ENGG - P', TUE: 'II ENGG - P', WED: 'II ENGG - P', THU: 'II ENGG - P', FRI: 'II ENGG - P', SAT: 'II ENGG - P' },
]
const SAMPLE_HEADERS = ['SL NO', 'FLOOR', 'ROOM NO', 'BLOCK', 'ROOM CAPACITY', 'TYPE', 'ASSIGNED', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

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

  const downloadSample = () => {
    const worksheet = XLSX.utils.json_to_sheet(SAMPLE_ROWS, {
      header: SAMPLE_HEADERS,
    })
    worksheet['!cols'] = SAMPLE_HEADERS.map(header => ({ wch: ['ASSIGNED', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].includes(header) ? 18 : 14 }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Room Assignments')
    XLSX.writeFile(workbook, 'room-department-assignments-sample.xlsx')
  }

  const upload = async () => {
    if (!file) return toast.error('Select the room assignment CSV/XLSX file')
    setUploading(true); setResult(null)
    try {
      const form = new FormData()
      form.append('assignment', file)
      const data = await postForm('/api/admin/room-assignments', form)
      if (!data.success) throw new Error(data.message)
      setResult(data)
      toast.success(`${data.roomCount} final rooms updated`)
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
          Upload CSV/XLSX to replace the final room list and update Assigned and Monday–Saturday values throughout Free Rooms.<br />
          Required columns: <strong>ROOM NO, ASSIGNED, MON, TUE, WED, THU, FRI, SAT</strong>. Optional room details: BLOCK, FLOOR, ROOM CAPACITY, TYPE.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <button className="btn btn-ghost" onClick={downloadSample}>Download Sample Excel</button>
        {status?.active && <button className="btn btn-danger" onClick={clear} disabled={clearing}>
          {clearing ? 'Clearing…' : 'Clear upload'}
        </button>}
      </div>
    </div>

    <details style={{ marginBottom: 14, border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Show sample Excel format and instructions</summary>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
        Every nonblank <strong>ROOM NO</strong> becomes part of the final room list. <strong>ASSIGNED</strong> describes the general use,
        while MON–SAT contain that day&apos;s department or allocation. Cells may be blank, but do not rename the headers.
      </div>
      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 850, width: '100%', fontSize: 11 }}>
          <thead><tr>{Object.keys(SAMPLE_ROWS[0]).map(header => <th key={header} style={{ padding: 7, textAlign: 'left', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>{header}</th>)}</tr></thead>
          <tbody>{SAMPLE_ROWS.slice(0, 2).map(row => <tr key={row['ROOM NO']}>
            {Object.keys(SAMPLE_ROWS[0]).map(header => <td key={header} style={{ padding: 7, border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{row[header]}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </details>

    {loading ? <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>Checking status…</div>
      : status?.active ? <div style={{ background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
        <strong style={{ color: '#10b981' }}>Active:</strong> {status.filename} · {status.roomCount} final rooms
        {status.duplicateCount ? ` · ${status.duplicateCount} duplicate rows merged` : ''} · uploaded {new Date(status.uploadedAt).toLocaleString()}
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
      Updated the final inventory with {result.roomCount} rooms.
      {result.duplicateCount ? ` ${result.duplicateCount} duplicate rows were merged.` : ''}
    </div>}
  </div>
}
