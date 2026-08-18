'use client'
import { Suspense } from 'react'
import { AuthProvider } from '@/components/AuthContext'
import ErpShell from '@/components/erp/ErpShell'
import ErpClashes from '@/components/erp/ErpClashes'

/** /erp/clashes?type=Room+Overlap&day=1&q=C007 — scans on arrival, filters from the link. */
export default function Page() {
  return (
    <AuthProvider>
      <Suspense fallback={null}>
        <ErpShell><ErpClashes /></ErpShell>
      </Suspense>
    </AuthProvider>
  )
}
