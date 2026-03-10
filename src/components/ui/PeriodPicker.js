'use client'

const ALL_PERIODS = Array.from({ length: 24 }, (_, i) => i + 1)

export default function PeriodPicker({ selected, onChange, max = 24 }) {
  const periods = ALL_PERIODS.slice(0, max)

  const toggle = (p) => {
    onChange(selected.includes(p) ? selected.filter(x => x !== p) : [...selected, p])
  }

  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:10 }}>
      {periods.map(p => (
        <button
          key={p}
          onClick={() => toggle(p)}
          className={`pill${selected.includes(p) ? ' active' : ''}`}
          style={{ minWidth:42, textAlign:'center' }}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
