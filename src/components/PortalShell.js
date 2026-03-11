'use client'
import { useState } from 'react'
import Navbar from './layout/Navbar'
import UploadModal from './ui/UploadModal'

export default function PortalShell({ children }) {
  const [showUpload, setShowUpload] = useState(false)

  return (
    <>
      <Navbar onManageData={() => setShowUpload(true)} />
      <main style={{ paddingTop: 58, minHeight:'100vh', display:'flex', flexDirection:'column' }}>
        <div style={{ maxWidth:1440, margin:'0 auto', width:'100%', padding:'20px 16px', flex:1 }}>
          <div className="card portal-card" style={{ minHeight:300 }}>
            {children}
          </div>
        </div>

        <footer style={{
          textAlign:'center', padding:'1.5rem 1rem',
          borderTop:'1px solid var(--border)', color:'var(--text-3)', fontSize:13,
        }}>
          Developed by{' '}
          <a href="https://akhilpanvi.com" target="_blank" rel="noreferrer"
            style={{ color:'var(--brand)', fontWeight:700, textDecoration:'none' }}>
            Ch Akhil Panvi
          </a>
          <br />
          <span style={{ fontSize:11, opacity:.6 }}>© 2026 KL University Timetable</span>
        </footer>
      </main>
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </>
  )
}
