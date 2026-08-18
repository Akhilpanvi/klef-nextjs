'use client'
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { useApi } from '@/components/AuthContext'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { syncUrl, parseList } from '@/components/erp/ErpShell'
import { DAYS, DAY_SHORT, lSt, thSt, tdSt } from '@/components/erp/shared'

// ── Sub-tab 2: Free Faculty ─────────────────────────────────────────────────
export default function ErpFreeFaculty() {
  const { get } = useApi()
  const params = useSearchParams()
  const [days, setDays]       = useState(() => parseList(params.get('days'), 6).length
    ? parseList(params.get('days'), 6) : [1])
  const [periods, setPeriods] = useState(() => parseList(params.get('periods'), 24))
  const [data, setData]       = useState(null)
  const [busy, setBusy]       = useState(false)
  const [selDepts, setSelDepts] = useState([])
  const [search, setSearch]   = useState('')
  const [sort, setSort]       = useState('ID')

  const toggleDay = d => setDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort())

  // Arrive with a slot in the link and it runs itself.
  const [autoRan, setAutoRan] = useState(false)
  useEffect(() => {
    if (autoRan) return
    if (parseList(params.get('days'), 6).length && parseList(params.get('periods'), 24).length) {
      setAutoRan(true); check()
    }
  }, [])

  const check = async () => {
    if (!days.length)    return toast.error('Select at least one day')
    if (!periods.length) return toast.error('Select at least one period')
    setBusy(true)
    try {
      const d = await get(`/api/erp/free-faculty?days=${days.join(',')}&periods=${periods.join(',')}`)
      if (!d.success) throw new Error(d.message)
      if (d.noData) { setData(null); return toast.error(d.message) }
      setData(d); setSelDepts([])
      syncUrl('/erp/free-faculty', { days, periods })
      toast.success(`${d.count} free faculty of ${d.totals.roster}`)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const allDepts = useMemo(() =>
    [...new Set((data?.faculty || []).map(f => f.dept).filter(Boolean))].sort(), [data])
  const toggleDept = d => setSelDepts(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.faculty
      .filter(f => !selDepts.length || selDepts.includes(f.dept))
      .filter(f => !search ||
        (f.name || '').toLowerCase().includes(search.toLowerCase()) ||
        String(f.id).includes(search))
      .sort((a, b) => sort === 'NAME'
        ? String(a.name || '').localeCompare(String(b.name || ''))
        : String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
  }, [data, selDepts, search, sort])

  const download = () => {
    if (!filtered.length) return toast.error('Nothing to export')
    const ws = XLSX.utils.json_to_sheet(filtered.map(f => ({
      'Emp No': f.id, Name: f.name || '', 'Dept (DPET)': f.dept || '',
      Designation: f.designation || '', 'Assigned Responsibility': f.responsibility || '',
      Cohort: f.cohort || '', 'Cohort Name': f.cohort_name || '',
      Phone: f.phone || '', Email: f.email || '', Campus: f.campus || '',
      'Designation Load': f.designationLoad ?? '', 'Permissible Load': f.permissibleLoad ?? '',
      'Weekly Load (ERP)': f.weeklyLoad, 'Courses (week)': f.weeklyCourses ?? '',
      'FD record': f.hasFd ? 'matched' : 'no FD row',
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ERP Free Faculty')
    XLSX.writeFile(wb, `erp-free-faculty-${days.map(d => DAY_SHORT[d - 1]).join('')}-P${periods.join('')}.xlsx`)
  }

  return (
    <div>
      <p style={lSt}>STEP 1 — Pick day(s)</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <button onClick={() => setDays(days.length === 6 ? [] : [1, 2, 3, 4, 5, 6])} style={{
          padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
          border: `1px solid ${days.length === 6 ? 'var(--brand)' : 'var(--border)'}`,
          background: days.length === 6 ? 'var(--brand)' : 'transparent',
          color: days.length === 6 ? '#fff' : 'var(--text-2)',
        }}>{days.length === 6 ? 'All week selected' : 'Select all week'}</button>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{days.length} day(s)</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {DAY_SHORT.map((d, i) => {
          const on = days.includes(i + 1)
          return (
            <button key={d} onClick={() => toggleDay(i + 1)} title={DAYS[i]} style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
              background: on ? 'var(--brand)' : 'transparent',
              color: on ? '#fff' : 'var(--text-2)',
            }}>{d}</button>
          )
        })}
      </div>

      <p style={lSt}>STEP 2 — Pick hour(s)</p>
      <PeriodPicker selected={periods} onChange={setPeriods} max={24} quick />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <button className="btn btn-primary" onClick={check} disabled={busy}>
          {busy ? 'Checking…' : 'Check availability'}
        </button>
        {data && <button className="btn btn-success" onClick={download}>📥 Export Excel</button>}
      </div>

      {data && (
        <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
            <strong style={{ color: 'var(--text-2)' }}>
              {days.map(d => DAY_SHORT[d - 1]).join(', ')} · hour(s) {periods.join(', ')}
            </strong>
            {' — '}{data.totals.free} free · {data.totals.busy} teaching · {data.totals.roster} on the ERP roster
            {data.totals.withoutFd > 0 && (
              <span style={{ color: '#f59e0b' }}> · {data.totals.withoutFd} without an FD record</span>
            )}
          </div>

          <p style={lSt}>FILTER BY DEPARTMENT (from FD) — {allDepts.length} dept(s)</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, maxHeight: 140, overflowY: 'auto' }}>
            {allDepts.map(d => (
              <button key={d} className={`pill${selDepts.includes(d) ? ' active' : ''}`} onClick={() => toggleDept(d)}>
                {d}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <select className="input" value={sort} onChange={e => setSort(e.target.value)} style={{ maxWidth: 150 }}>
              <option value="ID">Sort by Emp No</option>
              <option value="NAME">Sort by Name</option>
            </select>
            <input className="input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name or Emp No…" style={{ flex: 1, minWidth: 160 }} />
            <span style={{ fontWeight: 700, color: 'var(--brand)', fontSize: 14 }}>{filtered.length} shown</span>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 560, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={thSt}>Emp No</th>
                  <th style={thSt}>Name</th>
                  <th style={thSt}>Dept</th>
                  <th style={thSt}>Designation</th>
                  <th style={thSt}>Responsibility</th>
                  <th style={{ ...thSt, textAlign: 'right' }}>Week load / PL</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => (
                  <tr key={f.id}>
                    <td style={{ ...tdSt, fontFamily: 'monospace', fontWeight: 700 }}>{f.id}</td>
                    <td style={tdSt}>{f.name || '—'}</td>
                    <td style={{ ...tdSt, fontSize: 12 }}>{f.dept || '—'}</td>
                    <td style={{ ...tdSt, fontSize: 12 }}>{f.designation || '—'}</td>
                    <td style={{ ...tdSt, fontSize: 12 }}>{f.responsibility || '—'}</td>
                    <td style={{ ...tdSt, textAlign: 'right', fontSize: 12 }}>
                      {f.weeklyLoad}<span style={{ color: 'var(--text-3)' }}> / {f.permissibleLoad ?? '—'}</span>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={6} style={{ ...tdSt, color: 'var(--text-3)' }}>No faculty match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
