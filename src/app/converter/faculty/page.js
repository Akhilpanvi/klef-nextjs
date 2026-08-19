'use client'
import { AuthProvider } from '@/components/AuthContext'
import ConverterShell from '@/components/converter/ConverterShell'
import FacultyWorkload from '@/components/converter/FacultyWorkload'

/** /converter/faculty — faculty timetable and workload from an uploaded file. */
export default function Page() {
  return (
    <AuthProvider>
      <ConverterShell><FacultyWorkload /></ConverterShell>
    </AuthProvider>
  )
}
