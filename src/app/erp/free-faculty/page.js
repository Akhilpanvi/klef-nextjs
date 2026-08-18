'use client'
import { Suspense } from 'react'
import { AuthProvider } from '@/components/AuthContext'
import ErpShell from '@/components/erp/ErpShell'
import ErpFreeFaculty from '@/components/erp/ErpFreeFaculty'

/** /erp/free-faculty?days=1,2&periods=3,4 — runs itself when both are present. */
export default function Page() {
  return (
    <AuthProvider>
      <Suspense fallback={null}>
        <ErpShell><ErpFreeFaculty /></ErpShell>
      </Suspense>
    </AuthProvider>
  )
}
