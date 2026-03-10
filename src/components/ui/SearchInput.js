'use client'
import { useState, useRef, useEffect } from 'react'

export default function SearchInput({ value, onChange, onSelect, suggestions = [], placeholder, disabled }) {
  const [show, setShow] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const fn = e => { if (!ref.current?.contains(e.target)) setShow(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  return (
    <div ref={ref} style={{ position:'relative', flex:1, minWidth:200 }}>
      <input
        className="input"
        value={value}
        onChange={e => { onChange(e.target.value); setShow(true) }}
        onFocus={() => suggestions.length && setShow(true)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {show && suggestions.length > 0 && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0,
          background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:10, boxShadow:'var(--shadow-md)',
          maxHeight:240, overflowY:'auto', zIndex:200,
        }}>
          {suggestions.map((s, i) => (
            <div key={i}
              onClick={() => { onSelect(s); setShow(false) }}
              style={{
                padding:'10px 14px', cursor:'pointer',
                borderBottom:'1px solid var(--border)',
                transition:'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <div style={{ fontWeight:600, fontSize:14 }}>{s.label}</div>
              {s.sub && <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>{s.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
