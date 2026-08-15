'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Link as LinkIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import PortalShell from '@/components/PortalShell'
import { AuthProvider, useAuth } from '@/components/AuthContext'
import SlotSummaryTab from '@/components/free-rooms/SlotSummaryTab'

/**
 * Standalone, linkable Slot Summary.
 *
 *   /free-rooms/slot-summary                          → empty form
 *   /free-rooms/slot-summary?days=1&periods=3,4       → runs on load
 *
 * Same component as the Free Rooms tab; this route just gives it a URL.
 */
const parseList = (raw, max) =>
  String(raw || '').split(',').map(Number).filter(n => n >= 1 && n <= max)

function SlotSummaryContent() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const [query, setQuery] = useState(null)

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading])

  const initialDays    = useMemo(() => parseList(params.get('days'), 6),     [params])
  const initialPeriods = useMemo(() => parseList(params.get('periods'), 24), [params])

  // Keep the address bar in step without re-rendering the tree.
  const onQueryChange = ({ days, periods }) => {
    setQuery({ days, periods })
    window.history.replaceState(null, '',
      `/free-rooms/slot-summary?days=${days.join(',')}&periods=${periods.join(',')}`)
  }

  const copyLink = async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error(url)   // clipboard blocked (insecure context) — show it instead
    }
  }

  if (loading || !user) return null

  return (
    <PortalShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 16px' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: '1.25rem' }}>Slot Summary</h2>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
            Sections running and rooms free for a chosen day &amp; hour —{' '}
            <Link href="/free-rooms" style={{ color: 'var(--brand)' }}>back to Room Availability</Link>
          </div>
        </div>
        {query && (
          <button className="btn btn-ghost" onClick={copyLink}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <LinkIcon size={14} /> Copy link to this slot
          </button>
        )}
      </div>

      <SlotSummaryTab
        initialDays={initialDays}
        initialPeriods={initialPeriods}
        onQueryChange={onQueryChange}
      />
    </PortalShell>
  )
}

export default function SlotSummaryPage() {
  return (
    <AuthProvider>
      <Suspense fallback={null}>
        <SlotSummaryContent />
      </Suspense>
    </AuthProvider>
  )
}
