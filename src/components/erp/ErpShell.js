'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import PortalShell from '@/components/PortalShell'
import { useAuth } from '@/components/AuthContext'

/**
 * Frame shared by every ERP sub-page.
 *
 * Each sub-tab is a real route rather than local state, so a reload or a
 * duplicated browser tab lands back where you were instead of resetting to
 * the first tab. The sub-pages then keep their own selections in the query
 * string for the same reason.
 */
export const ERP_TABS = [
  { id: 'timetable',    label: '📅 Timetable',     path: '/erp/timetable' },
  { id: 'free-faculty', label: '🧑‍🏫 Free Faculty', path: '/erp/free-faculty' },
  { id: 'clashes',      label: '⚠ Clashes',        path: '/erp/clashes' },
]

export default function ErpShell({ children }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])
  if (loading || !user) return null

  return (
    <PortalShell>
      <h2 style={{ margin: '0 0 4px', fontFamily: "'DM Serif Display',serif", fontSize: '1.25rem' }}>ERP</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-3)' }}>
        Built only from the ERP uploads — the Room-wise and Faculty-wise timetables — with faculty
        details from the FD upload. Same constraints as the main pages, different source.
      </p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {ERP_TABS.map(t => {
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

/**
 * Replace the address bar without re-rendering the tree, so a selection can be
 * bookmarked or reloaded but typing in a filter does not push history entries.
 */
export function syncUrl(path, params) {
  if (typeof window === 'undefined') return
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue
    qs.set(k, Array.isArray(v) ? v.join(',') : String(v))
  }
  const s = qs.toString()
  window.history.replaceState(null, '', s ? `${path}?${s}` : path)
}

export const parseList = (raw, max) =>
  [...new Set(String(raw ?? '').split(',').map(Number).filter(n => n >= 1 && n <= max))]
    .sort((a, b) => a - b)
