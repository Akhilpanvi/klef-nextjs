'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import PortalShell from '@/components/PortalShell'
import { useAuth } from '@/components/AuthContext'

/**
 * Frame for the Converter section. Each sub-section is its own route so a
 * reload or a duplicated tab stays where it was.
 */
export const CONVERTER_TABS = [
  { id: 'rooms',   label: '🏫 Room Merger',      path: '/converter/rooms' },
  { id: 'faculty', label: '🧑‍🏫 Faculty Workload', path: '/converter/faculty' },
]

export default function ConverterShell({ children }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])
  if (loading || !user) return null

  return (
    <PortalShell>
      <h2 style={{ margin: '0 0 4px', fontFamily: "'DM Serif Display',serif", fontSize: '1.25rem' }}>Converter</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-3)' }}>
        Reshape an uploaded timetable into the form you need, with a live preview before you download.
      </p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {CONVERTER_TABS.map(t => {
          const active = pathname === t.path
          return (
            <button key={t.id} onClick={() => router.push(t.path)} style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
              color: active ? 'var(--brand)' : 'var(--text-2)', marginBottom: -2, transition: 'all .15s',
            }}>{t.label}</button>
          )
        })}
      </div>

      {children}
    </PortalShell>
  )
}
