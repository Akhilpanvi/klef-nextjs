'use client'

const ALL_PERIODS = Array.from({ length: 24 }, (_, i) => i + 1)

/**
 * PeriodPicker
 *
 * `quick` adds shortcut buttons. Teaching periods are 1-11, so that range gets
 * its own button rather than making the user tap eleven pills.
 */
export default function PeriodPicker({ selected, onChange, max = 24, quick = false, teachingMax = 11 }) {
  const periods = ALL_PERIODS.slice(0, max)
  const teaching = periods.filter(p => p <= teachingMax)

  const toggle = (p) => {
    onChange(selected.includes(p) ? selected.filter(x => x !== p) : [...selected, p])
  }

  const same = list =>
    list.length === selected.length && list.every(p => selected.includes(p))

  const btn = (label, list, title) => (
    <button
      key={label}
      onClick={() => onChange(same(list) ? [] : list)}
      title={title}
      style={{
        padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
        border: `1px solid ${same(list) ? 'var(--brand)' : 'var(--border)'}`,
        background: same(list) ? 'var(--brand)' : 'transparent',
        color: same(list) ? '#fff' : 'var(--text-2)',
      }}
    >{label}</button>
  )

  return (
    <div>
      {quick && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          {btn(`Hours 1-${teachingMax}`, teaching, `Select the ${teaching.length} teaching periods`)}
          {max > teachingMax && btn(`All ${max} hours`, periods, 'Select every period')}
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
                border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)',
              }}
            >Clear</button>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center' }}>
            {selected.length} selected
          </span>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {periods.map(p => (
          <button
            key={p}
            onClick={() => toggle(p)}
            className={`pill${selected.includes(p) ? ' active' : ''}`}
            style={{ minWidth: 42, textAlign: 'center' }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}
