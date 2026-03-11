'use client'

const DAY  = { 1:'Mon', 2:'Tue', 3:'Wed', 4:'Thu', 5:'Fri', 6:'Sat' }
const COMP = { 1:'L', 2:'T', 3:'P', 4:'S' }

const SEV_COLOR = {
  severe: { bg: '#fecdd3', border: '#f43f5e', text: '#9f1239', icon: '🔴' },
  warn:   { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', icon: '🟡' },
  info:   { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', icon: '🔵' },
}

function hl(text, term) {
  if (!text || !term) return text
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${esc})`, 'gi'),
    '<mark style="background:#fef08a;color:#78350f;padding:0 2px;border-radius:3px;font-weight:700">$1</mark>')
}

export default function TimetableGrid({ title, badge, entries, mode, hlTerm, showAllHours = false, clashes = [] }) {
  if (!entries?.length) return null

  // Build clash lookup: "day|hour" -> worst clash
  const clashMap = new Map()
  const ORDER = { severe: 0, warn: 1, info: 2 }
  for (const c of clashes) {
    const key = `${c.day}|${c.hour}`
    const existing = clashMap.get(key)
    if (!existing || ORDER[c.severity] < ORDER[existing.severity]) clashMap.set(key, c)
  }

  const allHours = [...new Set(entries.map(e => e.umat_hourno))].sort((a, b) => a - b)
  const hours = showAllHours ? allHours : allHours.filter(h => h <= 11)

  const grid = {}
  for (let d = 1; d <= 6; d++) { grid[d] = {}; for (const h of hours) grid[d][h] = [] }
  for (const e of entries) {
    if (grid[e.umatdayid]?.[e.umat_hourno] !== undefined) grid[e.umatdayid][e.umat_hourno].push(e)
  }

  const activeDays = [1,2,3,4,5,6].filter(d => hours.some(h => grid[d][h].length > 0))

  return (
    <div className="fade-up">
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:14 }}>
        <h3 style={{ margin:0, color:'var(--brand)', fontSize:'1rem', fontWeight:700, fontFamily:"'DM Serif Display', serif" }}>
          {title}
        </h3>
        {badge && (
          <span style={{ fontSize:12, background:'#d1fae5', color:'#065f46', padding:'3px 10px', borderRadius:999, fontWeight:700 }}>
            {badge}
          </span>
        )}
        {clashes.length > 0 && (
          <span style={{ fontSize:12, background:'#fecdd3', color:'#9f1239', padding:'3px 10px', borderRadius:999, fontWeight:700 }}>
            ⚠ {clashes.length} clash{clashes.length > 1 ? 'es' : ''} detected
          </span>
        )}
      </div>

      {clashes.length > 0 && (
        <div style={{ marginBottom:14, display:'flex', flexDirection:'column', gap:6 }}>
          {clashes.map((c, i) => {
            const sev = SEV_COLOR[c.severity] || SEV_COLOR.info
            const myName = (hlTerm || '').toLowerCase()
            const other = (c.faculty1 || '').toLowerCase() === myName ? c.faculty2 : c.faculty1
            const dayLabel = ['','Mon','Tue','Wed','Thu','Fri','Sat'][c.day] || `Day ${c.day}`
            return (
              <div key={i} style={{ padding:'8px 12px', borderRadius:8, fontSize:12, background:sev.bg, border:`1px solid ${sev.border}`, color:sev.text }}>
                <strong>{sev.icon} {c.type}</strong>
                {' — '}{dayLabel}, Period {c.hour} · Room {c.room}
                {other && other !== '-' && <> · Contact: <strong>{other}</strong></>}
                <div style={{ marginTop:2, opacity:0.85 }}>{c.desc}</div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ overflowX:'auto', borderRadius:10, border:'1px solid var(--border)' }}>
        <table className="tt-table">
          <thead>
            <tr>
              <th>Day</th>
              {hours.map(h => <th key={h}>P{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {activeDays.map(d => (
              <tr key={d}>
                <td>{DAY[d]}</td>
                {hours.map(h => {
                  const cells = grid[d][h]
                  const clash = clashMap.get(`${d}|${h}`)
                  const sev = clash ? SEV_COLOR[clash.severity] : null
                  return (
                    <td key={h} style={{ padding:4, ...(sev && cells.length ? { background:sev.bg, outline:`2px solid ${sev.border}`, outlineOffset:-2 } : {}) }}>
                      {clash && cells.length > 0 && (
                        <div title={clash.desc} style={{ fontSize:10, fontWeight:700, color:sev.text, marginBottom:2, cursor:'help' }}>
                          {sev.icon} {clash.type}
                        </div>
                      )}
                      {cells.map((c, i) => {
                        let main = ''
                        if (mode === 'FACULTY') main = c.faculty_name || '-'
                        else if (mode === 'ROOM') main = c.room_no || '-'
                        else main = `${c.room_no || '-'} · ${c.faculty_name || '-'}`
                        const mainHtml = hlTerm ? hl(main, hlTerm) : main
                        return (
                          <div key={i} className="class-card">
                            <div className="class-card-top">
                              <span>{COMP[c.coursedeliverycomponent] || 'L'}</span>
                              <span>Sec {c.main_sectionno}</span>
                            </div>
                            <div style={{ fontWeight:700, color:'var(--brand)', fontSize:11, lineHeight:1.3 }}
                              dangerouslySetInnerHTML={{ __html: mainHtml }} />
                            <div style={{ fontSize:10.5, color:'var(--text-2)', marginTop:2 }}>{c.course_code}</div>
                            {c.course_name && (
                              <div style={{ fontSize:10, color:'var(--text-3)', marginTop:1,
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:110 }}
                                title={c.course_name}>
                                {c.course_name}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
