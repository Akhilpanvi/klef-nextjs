'use client'

/**
 * Constants and small presentational pieces shared by the ERP sub-pages.
 * Each sub-tab is its own route now, so these can no longer live in one file.
 */

export const DAYS      = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_FULL  = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' }
export const DESG_LABEL = { R: 'Research', Ac: 'Academic', Ad: 'Administrative' }
export const SEV_LABEL  = { severe: 'SEVERE', warn: 'WARNING', info: 'INFO' }
export const TYPE_ICON  = { 'Room Overlap': '🔴', 'Dual Faculty': '🟡', 'Faculty Double-Booked': '🔵' }
export const COMP_LABEL = { 1: 'Lecture', 2: 'Tutorial', 3: 'Practical', 4: 'Skill' }
export const COMP_SHORT = { 1: 'L', 2: 'T', 3: 'P', 4: 'S' }
export const lSt  = { fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em', margin: '0 0 8px' }
export const thSt = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', borderBottom: '2px solid var(--border)', background: 'var(--surface-2)', whiteSpace: 'nowrap', textAlign: 'left' }
export const tdSt = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid var(--border)' }

export function SourceNote({ sources, counts, extra }) {
  if (!sources) return null
  const bits = []
  if (sources.roomwise)    bits.push(`Room-wise TT ${sources.roomwise.rows.toLocaleString()} rows`)
  if (sources.facultywise) bits.push(`Faculty-wise TT ${sources.facultywise.rows.toLocaleString()} rows`)
  return (
    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
      ERP sources — {bits.join(' · ') || 'none uploaded'}
      {counts && ` · merged to ${(counts.facultywise + counts.roomwise).toLocaleString()} classes`}
      {extra}
      {(!sources.roomwise || !sources.facultywise) && (
        <span style={{ color: '#f59e0b' }}>
          {' '}· {!sources.facultywise ? 'Faculty-wise TT missing — no faculty names' : 'Room-wise TT missing'}
        </span>
      )}
    </div>
  )
}

export function ProfileCard({ data, load }) {
  if (!data && !load) return null
  const fields = [
    { label: 'Emp No', value: data?.eid },
    { label: 'Department (DPET)', value: data?.dept },
    { label: 'Designation', value: data?.designation },
    { label: 'Category', value: data?.designation_category
      ? `${data.designation_category} — ${DESG_LABEL[data.designation_category] || data.designation_category}` : null },
    { label: 'Assigned Responsibility', value: data?.assigned_responsibility },
    { label: 'Cohort', value: data?.cohort_name ? `${data.cohort} — ${data.cohort_name}` : data?.cohort },
    { label: 'Phone', value: data?.phone },
    { label: 'Email', value: data?.email },
    { label: 'Designation Load', value: data?.load_as_per_designation != null ? `${data.load_as_per_designation} hrs` : null },
    { label: 'Permissible Load', value: data?.pl != null ? `${data.pl} hrs` : null },
    { label: 'Actual Load (ERP)', value: load ? `${load.slots} hrs` : null },
    { label: 'Utilisation', value: load && data?.pl ? `${Math.round((load.slots / data.pl) * 100)}%` : null },
    { label: 'Courses', value: load?.courses },
    { label: 'Rooms used', value: load?.rooms },
  ].filter(f => f.value != null && f.value !== '')

  if (!fields.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginBottom: 20,
      padding: 16, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
      {fields.map(f => (
        <div key={f.label}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{f.label}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{f.value}</div>
        </div>
      ))}
    </div>
  )
}

export function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '16px 18px', textAlign: 'center', minWidth: 110, flex: '1 1 110px' }}>
      <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1, fontFamily: "'DM Serif Display',serif" }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginTop: 4, letterSpacing: '.04em' }}>{label}</div>
    </div>
  )
}
