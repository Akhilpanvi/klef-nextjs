'use client'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'

export default function RootLayout({ children }) {
  useEffect(() => {
    const saved = localStorage.getItem('klef_theme') || 'light'
    document.documentElement.classList.toggle('dark', saved === 'dark')
  }, [])

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>KL University Timetable</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '14px',
            },
          }}
        />
      </body>
    </html>
  )
}
