'use client'

const DAY  = { 1:'Mon', 2:'Tue', 3:'Wed', 4:'Thu', 5:'Fri', 6:'Sat' }
const COMP = { 1:'L', 2:'T', 3:'P', 4:'S' }

function hl(text, term) {
  if (!text || !term) return text
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${esc})`, 'gi'),
    '<mark style="background:#fef08a;color:#78350f;padding:0 2px;border-radius:3px;font-weight:700">$1</mark>')
}

export default function TimetableGrid({ title, badge, entries, mode, hlTerm, showAllHours = false }) {
  if (!entries?.length) return null

  // hours present in data — cap at 11 unless admin
  const allHours = [...new Set(entries.map(e => e.umat_hourno))].sort((a, b) => a - b)
  const hours = showAllHours ? allHours : allHours.filter(h => h <= 11)

  // Build grid
  const grid = {}
  for (let d = 1; d <= 6; d++) {
    grid[d] = {}
    for (const h of hours) grid[d][h] = []
  }
  for (const e of entries) {
    if (grid[e.umatdayid]?.[e.umat_hourno] !== undefined) {
      grid[e.umatdayid][e.umat_hourno].push(e)
    }
  }

  // Only include days that have at least one entry
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
      </div>

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
                  return (
                    <td key={h} style={{ padding:4 }}>
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
                            <div style={{ fontSize:10.5, color:'var(--text-2)', marginTop:2 }}>
                              {c.course_code}
                            </div>
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
