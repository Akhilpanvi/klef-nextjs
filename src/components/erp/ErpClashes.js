'use client'
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useApi } from '@/components/AuthContext'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { syncUrl } from '@/components/erp/ErpShell'
import { DAYS, DAY_FULL, SEV_LABEL, TYPE_ICON, lSt, SourceNote, StatCard } from '@/components/erp/shared'

// ── Sub-tab 3: Clashes ──────────────────────────────────────────────────────

function ClashCard({ c }) {
  return (
    <div className={`clash-card clash-${c.severity}`}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999,
          background: c.severity === 'severe' ? '#fecdd3' : c.severity === 'warn' ? '#fef3c7' : '#dbeafe',
          color: c.severity === 'severe' ? '#9f1239' : c.severity === 'warn' ? '#92400e' : '#1e40af',
          textTransform: 'uppercase', letterSpacing: '.05em',
        }}>{SEV_LABEL[c.severity]}</span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{TYPE_ICON[c.type]} {c.type}</span>
        <span style={{ fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 9px', color: 'var(--text-2)' }}>
          {DAY_FULL[c.day]} · Period {c.hour}
        </span>
        <span style={{ fontSize: 12, background: '#dbeafe', color: '#1e40af', borderRadius: 6, padding: '2px 9px', fontWeight: 600 }}>
          📍 {c.room} <em style={{ fontWeight: 400 }}>({c.roomType})</em>
        </span>
      </div>
      <div className="clash-detail-grid">
        <div><span style={{ fontSize: 11, color: 'var(--text-3)' }}>Course 1</span><br /><b>{c.courseCode1}</b></div>
        <div><span style={{ fontSize: 11, color: 'var(--text-3)' }}>Course 2</span><br /><b>{c.courseCode2}</b></div>
        <div><span style={{ fontSize: 11, color: 'var(--text-3)' }}>Sections</span><br />{c.section}</div>
        <div><span style={{ fontSize: 11, color: 'var(--text-3)' }}>Faculty</span><br />
          {c.faculty1}{c.faculty1 !== c.faculty2 ? ` & ${c.faculty2}` : ''}
        </div>
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,.08)', fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
        {c.desc}
      </div>
    </div>
  )
}

export default function ErpClashes() {
  const { get } = useApi()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const params = useSearchParams()
  const [typeF, setTypeF] = useState(() => params.get('type') || '')
  const [dayF, setDayF]   = useState(() => params.get('day') || '')
  const [search, setSearch] = useState(() => params.get('q') || '')
  const [limit, setLimit] = useState(60)

  const run = async () => {
    setBusy(true)
    try {
      const d = await get('/api/erp/clashes')
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setData(null); return toast.error(d.message) }
      setData(d); setLimit(60)
      syncUrl('/erp/clashes', { type: typeF, day: dayF, q: search })
      toast.success(`${d.stats.total} clash(es) — ${d.stats.severe} severe`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  // The scan takes no parameters, so just run it on arrival — the filters are
  // what the link carries, and they apply to the result.
  useEffect(() => { run() }, [])

  // Keep the filters in the address bar so a reload restores them.
  useEffect(() => {
    if (!data) return
    syncUrl('/erp/clashes', { type: typeF, day: dayF, q: search })
  }, [typeF, dayF, search, data])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.clashes
      .filter(c => !typeF || c.type === typeF)
      .filter(c => !dayF || String(c.day) === dayF)
      .filter(c => !q ||
        [c.room, c.courseCode1, c.courseCode2, c.faculty1, c.faculty2, c.section]
          .some(v => String(v || '').toLowerCase().includes(q)))
  }, [data, typeF, dayF, search])

  const download = () => {
    if (!filtered.length) return toast.error('Nothing to export')
    const ws = XLSX.utils.json_to_sheet(filtered.map(c => ({
      Severity: SEV_LABEL[c.severity], Type: c.type,
      Day: DAY_FULL[c.day], Period: c.hour,
      Room: c.room, 'Room Type': c.roomType,
      'Course 1': c.courseCode1, 'Course 2': c.courseCode2,
      Sections: c.section, 'Faculty 1': c.faculty1, 'Faculty 2': c.faculty2,
      Description: c.desc,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ERP Clashes')
    XLSX.writeFile(wb, 'erp-clashes.xlsx')
  }

  const types = useMemo(() =>
    [...new Set((data?.clashes || []).map(c => c.type))].sort(), [data])

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? 'Scanning…' : data ? 'Re-scan ERP data' : 'Scan ERP data for clashes'}
        </button>
        {data && <button className="btn btn-success" onClick={download}>📥 Export Excel</button>}
      </div>

      {data && (
        <div>
          <SourceNote sources={data.sources} counts={data.counts} />

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            <StatCard label="Total" value={data.stats.total} color="var(--brand)" />
            <StatCard label="Severe" value={data.stats.severe} color="#e11d48" />
            <StatCard label="Warning" value={data.stats.warn} color="#f59e0b" />
            <StatCard label="Info" value={data.stats.info} color="#3b82f6" />
            <StatCard label="Slots hit" value={data.stats.slotsAffected} color="var(--text-2)" />
            <StatCard label="Rooms hit" value={data.stats.roomsAffected} color="var(--text-2)" />
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14, padding: 10,
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-2)' }}>What this source can and cannot show.</strong><br />
            <b>Room Overlap</b> is detected normally — two different courses sharing a room in one period.<br />
            <b>Dual Faculty</b> is not reported. The room-wise grid puts the associative section in the
            room name (C007-MA, C007-A, C007-B: main plus supporting faculty on one class) while the
            faculty-wise grid records the plain room with no suffix, so nothing separates a main
            teacher from a supporting one. Several faculty on the same room, course and section are
            support staff, not a clash
            {data.stats.coTaughtClasses > 0 && (
              <> — {data.stats.coTaughtClasses.toLocaleString()} class-hours here are co-taught,
                {' '}{data.stats.supportingFaculty.toLocaleString()} supporting assignments, up to
                {' '}{data.stats.maxFacultyOnAClass} faculty on one class</>
            )}.<br />
            <b>Faculty Double-Booked</b> is always 0: the grid holds one cell per faculty per period,
            so it cannot record the same teacher in two places.
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <select className="input" value={typeF} onChange={e => setTypeF(e.target.value)} style={{ maxWidth: 190 }}>
              <option value="">All types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="input" value={dayF} onChange={e => setDayF(e.target.value)} style={{ maxWidth: 150 }}>
              <option value="">All days</option>
              {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
            <input className="input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search room, course, faculty…" style={{ flex: 1, minWidth: 180 }} />
            <span style={{ fontWeight: 700, color: 'var(--brand)', fontSize: 14 }}>{filtered.length} shown</span>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {filtered.slice(0, limit).map((c, i) => <ClashCard key={i} c={c} />)}
          </div>
          {filtered.length > limit && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setLimit(l => l + 60)}>
                Show 60 more ({filtered.length - limit} remaining)
              </button>
            </div>
          )}
          {!filtered.length && (
            <div style={{ padding: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text-3)' }}>
              No clashes match these filters.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
