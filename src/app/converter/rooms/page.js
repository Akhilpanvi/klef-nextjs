'use client'
import { AuthProvider } from '@/components/AuthContext'
import ConverterShell from '@/components/converter/ConverterShell'
import RoomMerger from '@/components/converter/RoomMerger'

/** /converter/rooms — merge the room-wise timetable to one row per room. */
export default function Page() {
  return (
    <AuthProvider>
      <ConverterShell><RoomMerger /></ConverterShell>
    </AuthProvider>
  )
}
