'use client'
import { Suspense } from 'react'
import { AuthProvider } from '@/components/AuthContext'
import ErpShell from '@/components/erp/ErpShell'
import ErpTimetable from '@/components/erp/ErpTimetable'

/**
 * /erp/timetable?type=faculty|room|course&q=...
 * The subject rides in the query string, so the link reopens exactly as left.
 */
export default function Page() {
  return (
    <AuthProvider>
      <Suspense fallback={null}>
        <ErpShell><ErpTimetable /></ErpShell>
      </Suspense>
    </AuthProvider>
  )
}
