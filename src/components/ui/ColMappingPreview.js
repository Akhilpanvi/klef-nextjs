'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { DEFAULT_COLUMNS, describeHeaders, resolveColumns } from '@/lib/csvColumns'

/**
 * Upload column check.
 *
 * Driven by the shared alias table rather than its own list, so a field counts
 * as found when ANY accepted spelling is present — "uni_id" or "EMP ID",
 * "coursecode" or "Course code" — and the row shows which one the file used.
 *
 * Any admin overrides are pulled in so the preview matches what the parser
 * will actually do; if that lookup fails it quietly falls back to the defaults.
 */
export default function ColMappingPreview({ preview, defaultExpanded = true, columns = null }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [showAll, setShowAll]   = useState(false)
  const [effective, setEffective] = useState(columns || DEFAULT_COLUMNS)

  useEffect(() => {
    if (columns) { setEffective(columns); return }
    let cancelled = false
    fetch('/api/admin/column-mapping', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d?.success && d.effective) setEffective(resolveColumns(d.overrides)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [columns])

  if (!preview?.headers?.length) return null

  const headers = preview.headers
  const rows    = describeHeaders(headers, effective)

  const criticalMissing = rows.filter(r => r.required && r.missing)
  const hasIssues   = criticalMissing.length > 0
  const visibleRows = showAll ? rows : rows.filter(r => r.required || !r.missing)

  const usedNames = new Set(rows.map(r => r.matched).filter(Boolean))
  const extraCols = headers.filter(h => !usedNames.has(h))

  return (
    <div style={{ borderRadius:8, overflow:'hidden', border:`1.5px solid ${hasIssues ? '#ef4444' : '#16a34a'}`, marginTop:10 }}>

      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'8px 12px', background: hasIssues ? '#fef2f2' : '#f0fdf4',
          border:'none', cursor:'pointer', textAlign:'left',
        }}
      >
        <span style={{ fontWeight:700, fontSize:12.5, color: hasIssues ? '#991b1b' : '#15803d' }}>
          {hasIssues
            ? `⚠ Column mismatch — ${criticalMissing.length} required column${criticalMissing.length > 1 ? 's' : ''} not found`
            : `✓ All required columns found · ${headers.length} columns detected`}
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div style={{ background:'var(--surface-2)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                <th style={{ padding:'6px 10px', textAlign:'left', fontWeight:700, color:'var(--text-3)', width:'24%' }}>App Field</th>
                <th style={{ padding:'6px 10px', textAlign:'left', fontWeight:700, color:'var(--text-3)', width:'30%' }}>CSV Column</th>
                <th style={{ padding:'6px 10px', textAlign:'center', fontWeight:700, color:'var(--text-3)', width:'8%' }}>Found</th>
                <th style={{ padding:'6px 10px', textAlign:'left', fontWeight:700, color:'var(--text-3)' }}>Sample Value</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ field, label, required, aliases, matched, missing }) => {
                const sample = matched ? preview.firstRow?.[matched] : undefined
                const rowBg  = !missing ? 'transparent' : required ? '#fef2f2' : '#fffbeb'
                return (
                  <tr key={field} style={{ borderBottom:'1px solid var(--border)', background:rowBg }}>
                    <td style={{ padding:'5px 10px', color:'var(--text)', fontWeight: required ? 600 : 400 }}>
                      {label}
                      {required && <span style={{ marginLeft:4, fontSize:10, color:'#ef4444', fontWeight:700 }}>REQ</span>}
                    </td>
                    <td style={{ padding:'5px 10px', fontFamily:'monospace', color:'var(--text-2,var(--text))' }}>
                      {matched || aliases.join(' / ')}
                      {matched && aliases.length > 1 && aliases[0] !== matched && (
                        <span style={{ marginLeft:5, fontSize:10, color:'var(--text-3)', fontFamily:'inherit' }}>
                          (older name)
                        </span>
                      )}
                    </td>
                    <td style={{ padding:'5px 10px', textAlign:'center', fontWeight:700,
                      color: !missing ? '#16a34a' : required ? '#ef4444' : '#f59e0b' }}>
                      {missing ? '✗' : '✓'}
                    </td>
                    <td style={{ padding:'5px 10px', color: sample ? 'var(--text)' : 'var(--text-3)', fontStyle: sample ? 'normal' : 'italic' }}>
                      {sample ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ padding:'6px 10px', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', borderTop:'1px solid var(--border)' }}>
            <button
              onClick={() => setShowAll(s => !s)}
              style={{ fontSize:11, color:'var(--text-3)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', padding:0 }}>
              {showAll ? 'Hide unused optional fields' : `Show all ${rows.length} fields`}
            </button>
            {extraCols.length > 0 && (
              <span style={{ fontSize:11, color:'var(--text-3)' }}>
                Extra columns (not used): {extraCols.join(', ')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
