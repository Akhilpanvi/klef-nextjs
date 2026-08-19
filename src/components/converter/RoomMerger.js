'use client'
import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { useApi } from '@/components/AuthContext'

const DAY_KEYS  = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const lSt  = { fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em', margin: '0 0 8px' }
const thSt = { padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', borderBottom: '2px solid var(--border)', background: 'var(--surface-2)', whiteSpace: 'nowrap', textAlign: 'left' }
const tdSt = { padding: '5px 8px', fontSize: 11, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }

const PREVIEW_ROOMS = 30

function Stat({ label, value, sub, color }) {
  return (
    <div className="card" style={{ padding: 14, minWidth: 140, flex: '1 1 140px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: color || 'var(--text-3)', letterSpacing: '.04em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function RoomMerger() {
  const { get } = useApi()
  const [data, setData]     = useState(null)
  const [busy, setBusy]     = useState(false)
  const [sep, setSep]       = useState(' | ')
  const [showAll, setShowAll]         = useState(false)
  const [conflictsOnly, setConflicts] = useState(false)
  const [search, setSearch] = useState('')

  const load = async () => {
    setBusy(true)
    try {
      const d = await get('/api/converter/rooms')
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setData(null); return toast.error(d.message) }
      setData(d)
      toast.success(`${d.stats.sourceRooms} room names merged to ${d.stats.mergedRooms}`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }
  useEffect(() => { load() }, [])

  // Column set comes from the hours actually present after 12-22 are dropped.
  const cols = useMemo(() => {
    if (!data) return []
    const out = []
    for (let d = 0; d < 6; d++)
      for (const h of data.hours) out.push({ key: `${DAY_KEYS[d]}${h}`, day: d + 1, hour: h })
    return out
  }, [data])

  const rows = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.rooms
      .filter(r => !conflictsOnly || r.conflictCells > 0)
      .filter(r => !q || r.room.toLowerCase().includes(q) ||
        r.variants.some(v => v.toLowerCase().includes(q)))
  }, [data, conflictsOnly, search])

  /** One merged room as a flat { 'mon1': label, … } record. */
  const gridRow = (r) => {
    const byKey = new Map(r.cells.map(c => [`${DAY_KEYS[c.d - 1]}${c.h}`, c]))
    const row = { 'Room No': r.room }
    for (const c of cols) {
      const cell = byKey.get(c.key)
      row[c.key] = cell ? cell.labels.join(sep) : '-'
    }
    return row
  }

  const download = () => {
    if (!data) return toast.error('Nothing to export')
    try {
      const wb = XLSX.utils.book_new()
      const headers = ['Room No', ...cols.map(c => c.key)]

      XLSX.utils.book_append_sheet(wb,
        XLSX.utils.json_to_sheet(data.rooms.map(gridRow), { header: headers }),
        'Merged Timetable')

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        data.rooms.map(r => ({
          'Merged Room': r.room,
          'Merged From': r.variants.join(' | '),
          'Sub-rooms': r.variants.length,
          'Busy cells': r.busyCells,
          'Cells holding more than one class': r.conflictCells,
        }))), 'Merge Map')

      const conflicts = []
      for (const r of data.rooms)
        for (const c of r.cells)
          if (c.merged) conflicts.push({
            Room: r.room, Day: DAY_SHORT[c.d - 1], Period: c.h,
            'Classes in this cell': c.labels.length,
            Labels: c.labels.join(' | '),
          })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        conflicts.length ? conflicts : [{ Note: 'No cell held more than one class' }]), 'Multi-class Cells')

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
        { Metric: 'Source file', Value: data.snapshot },
        { Metric: 'Source rows', Value: data.stats.sourceRows },
        { Metric: `Rows dropped (period ${data.droppedHours.from} and above)`, Value: data.stats.droppedRows },
        { Metric: 'Rows used', Value: data.stats.sourceRowsUsed },
        { Metric: 'Room names in source', Value: data.stats.sourceRooms },
        { Metric: 'Merged rooms', Value: data.stats.mergedRooms },
        { Metric: 'Rooms that had no sub-rooms', Value: data.stats.unchangedRooms },
        { Metric: 'Busy cells after merge', Value: data.stats.busyCells },
        { Metric: 'Duplicate rows collapsed', Value: data.stats.duplicateRowsCollapsed },
        { Metric: 'Cells holding more than one class', Value: data.stats.conflictCells },
        { Metric: 'Rooms affected by those', Value: data.stats.roomsWithConflicts },
        { Metric: 'Periods kept', Value: data.hours.join(', ') },
      ]), 'Summary')

      XLSX.writeFile(wb, `merged-room-timetable-${data.stats.mergedRooms}-rooms.xlsx`)
    } catch (err) {
      console.error('Export failed:', err)
      toast.error(`Export failed: ${err?.message || err}`)
    }
  }

  const shown = showAll ? rows : rows.slice(0, PREVIEW_ROOMS)

  return (
    <div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-2)' }}>
        The room-wise export splits each room across its associative sections — <code>C009-MA</code>,
        {' '}<code>C009-A</code>, <code>C009-B</code>, <code>C009-C</code> — so one room appears several
        times. This merges them back into a single <code>C009</code> row.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={load} disabled={busy}>
          {busy ? 'Merging…' : data ? 'Reload source' : 'Merge rooms'}
        </button>
        {data && <button className="btn btn-success" onClick={download}>📥 Download Excel</button>}
      </div>

      {data && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
            Source: {data.snapshot} · periods {data.droppedHours.from} and above removed
            ({data.stats.droppedRows.toLocaleString()} rows) · keeping periods 1–{data.maxHour}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            <Stat label="ROOM NAMES IN" value={data.stats.sourceRooms} sub="in the source file" />
            <Stat label="MERGED ROOMS" value={data.stats.mergedRooms} sub="after merging" color="#059669" />
            <Stat label="ROWS COLLAPSED" value={data.stats.duplicateRowsCollapsed.toLocaleString()} sub="duplicate entries removed" color="#0ea5e9" />
            <Stat label="BUSY CELLS" value={data.stats.busyCells.toLocaleString()} sub="after merge" />
            <Stat label="MULTI-CLASS CELLS" value={data.stats.conflictCells.toLocaleString()}
              sub={`${data.stats.roomsWithConflicts} room(s) affected`} color={data.stats.conflictCells ? '#f59e0b' : '#10b981'} />
          </div>

          {data.stats.conflictCells > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14, padding: 10,
              background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, lineHeight: 1.6 }}>
              <strong style={{ color: '#b45309' }}>Merging is not lossless here.</strong> In
              {' '}{data.stats.conflictCells.toLocaleString()} cells the sub-rooms hold different classes —
              usually several sections of one course sharing the room. Every label is kept and joined with
              “{sep.trim() || 'the separator'}”, and those cells are highlighted below and listed on the
              Multi-class Cells sheet. Nothing is dropped.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <input className="input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Filter rooms…" style={{ maxWidth: 220, fontSize: 12 }} />
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={conflictsOnly} onChange={e => setConflicts(e.target.checked)} />
              Only rooms with multi-class cells
            </label>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              Join with
              <select className="input" value={sep} onChange={e => setSep(e.target.value)} style={{ maxWidth: 130, fontSize: 12, padding: '4px 6px' }}>
                <option value=" | ">pipe  |</option>
                <option value=" / ">slash  /</option>
                <option value={'\n'}>new line</option>
                <option value="; ">semicolon  ;</option>
              </select>
            </label>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {rows.length} room(s){!showAll && rows.length > PREVIEW_ROOMS ? ` · previewing ${PREVIEW_ROOMS}` : ''}
            </span>
            {rows.length > PREVIEW_ROOMS && (
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => setShowAll(s => !s)}>
                {showAll ? 'Preview fewer' : `Show all ${rows.length}`}
              </button>
            )}
          </div>

          <p style={lSt}>LIVE PREVIEW — exactly what the Excel will contain</p>
          <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 560 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ ...thSt, position: 'sticky', left: 0, zIndex: 3, minWidth: 120 }}>Room No</th>
                  <th style={{ ...thSt, minWidth: 130 }}>Merged from</th>
                  {cols.map(c => (
                    <th key={c.key} style={{ ...thSt, minWidth: 110, textAlign: 'center' }}>{c.key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(r => {
                  const byKey = new Map(r.cells.map(c => [`${DAY_KEYS[c.d - 1]}${c.h}`, c]))
                  return (
                    <tr key={r.room}>
                      <td style={{ ...tdSt, position: 'sticky', left: 0, background: 'var(--surface)', fontWeight: 700, fontFamily: 'monospace', zIndex: 2 }}>
                        {r.room}
                      </td>
                      <td style={{ ...tdSt, color: 'var(--text-3)', fontSize: 10 }}>
                        {r.variants.length > 1
                          ? `${r.variants.length} sub-rooms`
                          : <span style={{ color: 'var(--text-3)' }}>unchanged</span>}
                        <div style={{ fontFamily: 'monospace' }}>{r.variants.join(', ')}</div>
                      </td>
                      {cols.map(c => {
                        const cell = byKey.get(c.key)
                        if (!cell) return <td key={c.key} style={{ ...tdSt, color: 'var(--text-3)', textAlign: 'center' }}>-</td>
                        return (
                          <td key={c.key} title={cell.labels.join('\n')} style={{
                            ...tdSt,
                            background: cell.merged ? 'rgba(245,158,11,.14)' : undefined,
                            fontWeight: cell.merged ? 700 : 400,
                          }}>
                            {cell.labels.map((l, i) => <div key={i}>{l}</div>)}
                            {cell.merged && (
                              <div style={{ fontSize: 9, color: '#b45309' }}>{cell.labels.length} classes merged</div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {!shown.length && (
                  <tr><td colSpan={cols.length + 2} style={{ ...tdSt, color: 'var(--text-3)' }}>No rooms match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8 }}>
            Amber cells held more than one class before merging. The Excel contains every room,
            not just the preview.
          </div>
        </>
      )}
    </div>
  )
}
