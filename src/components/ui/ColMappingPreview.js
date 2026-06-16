'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export const COL_MAP = [
  { field: 'Day',            col: 'umatdayid',             critical: true  },
  { field: 'Period / Hour',  col: 'umat_hourno',           critical: true  },
  { field: 'Employee ID',    col: 'EMP ID',                critical: true  },
  { field: 'Faculty Name',   col: 'F-Name',                critical: true  },
  { field: 'Faculty Dept',   col: 'F-Dept',                critical: true  },
  { field: 'Room No',        col: 'ROOM NO',               critical: true  },
  { field: 'Department',     col: 'DEPT',                  critical: true  },
  { field: 'Course Code',    col: 'Course code',           critical: false },
  { field: 'Course Name',    col: 'C-Name',                critical: false },
  { field: 'Regulation',     col: 'REG',                   critical: false },
  { field: 'Year',           col: 'YEAR',                  critical: false },
  { field: 'Section No',     col: 'main_sectionno',        critical: false },
  { field: 'Sub Section',    col: 'associative_sectionno', critical: false },
  { field: 'Faculty Seq',    col: 'faculty_seq',           critical: false },
  { field: 'Sec Count',      col: 'SEC COUNT',             critical: false },
  { field: 'Faculty Cohort', col: 'F-Cohort',              critical: false },
  { field: 'FCTT',           col: 'FCTT',                  critical: false },
  { field: 'RCTT',           col: 'RCTT',                  critical: false },
  { field: 'Room Con',       col: 'ROOM CON',              critical: false },
  { field: 'Room Type',      col: 'R-TYPE',                critical: false },
  { field: 'Room Cap',       col: 'R-CAP',                 critical: false },
  { field: 'Room Diff',      col: 'R-DIFF',                critical: false },
]

export const KNOWN_COLS = new Set(COL_MAP.map(m => m.col))

/**
 * preview: { headers: string[], firstRow: Record<string,string> }
 * defaultExpanded: whether to start open (default true)
 */
export default function ColMappingPreview({ preview, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [showAll, setShowAll]   = useState(false)

  if (!preview?.headers?.length) return null

  const criticalMissing = COL_MAP.filter(m => m.critical && !preview.headers.includes(m.col))
  const hasIssues  = criticalMissing.length > 0
  const visibleRows = showAll ? COL_MAP : COL_MAP.filter(m => m.critical)
  const extraCols  = preview.headers.filter(h => !KNOWN_COLS.has(h))

  return (
    <div style={{ borderRadius:8, overflow:'hidden', border:`1.5px solid ${hasIssues ? '#ef4444' : '#16a34a'}`, marginTop:10 }}>

      {/* Clickable header */}
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
            ? `⚠ Column mismatch — ${criticalMissing.length} critical column${criticalMissing.length > 1 ? 's' : ''} not found`
            : `✓ All critical columns found · ${preview.headers.length} columns detected`}
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div style={{ background:'var(--surface-2)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                <th style={{ padding:'6px 10px', textAlign:'left', fontWeight:700, color:'var(--text-3)', width:'28%' }}>App Field</th>
                <th style={{ padding:'6px 10px', textAlign:'left', fontWeight:700, color:'var(--text-3)', width:'28%' }}>CSV Column</th>
                <th style={{ padding:'6px 10px', textAlign:'center', fontWeight:700, color:'var(--text-3)', width:'10%' }}>Found</th>
                <th style={{ padding:'6px 10px', textAlign:'left', fontWeight:700, color:'var(--text-3)' }}>Sample Value</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ field, col, critical }) => {
                const found  = preview.headers.includes(col)
                const sample = preview.firstRow?.[col]
                const rowBg  = found ? 'transparent' : critical ? '#fef2f2' : '#fffbeb'
                return (
                  <tr key={col} style={{ borderBottom:'1px solid var(--border)', background:rowBg }}>
                    <td style={{ padding:'5px 10px', color:'var(--text)', fontWeight: critical ? 600 : 400 }}>
                      {field}
                      {critical && <span style={{ marginLeft:4, fontSize:10, color:'#ef4444', fontWeight:700 }}>REQ</span>}
                    </td>
                    <td style={{ padding:'5px 10px', fontFamily:'monospace', color:'var(--text-2,var(--text))' }}>{col}</td>
                    <td style={{ padding:'5px 10px', textAlign:'center', fontWeight:700,
                      color: found ? '#16a34a' : critical ? '#ef4444' : '#f59e0b' }}>
                      {found ? '✓' : '✗'}
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
              {showAll ? 'Show critical only' : `Show all ${COL_MAP.length} columns`}
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
