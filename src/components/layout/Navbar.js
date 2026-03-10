'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../AuthContext'
import { Menu, X, Sun, Moon, Lock, FolderOpen } from 'lucide-react'

const TABS = [
  { label: 'Faculty',       path: '/faculty' },
  { label: 'Rooms',         path: '/rooms' },
  { label: 'Courses',       path: '/courses' },
  { label: 'Free Faculty',  path: '/free-faculty' },
  { label: 'Free Rooms',    path: 'https://rooms.kluniversity.me', external: true },
  { label: '⚠ Clashes',    path: '/clash', bold: true },
]

export default function Navbar({ onManageData }) {
  const { logout, isAdmin } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()
  const [open, setOpen]   = useState(false)
  const [dark, setDark]   = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('klef_theme') === 'dark'
  )

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('klef_theme', next ? 'dark' : 'light')
  }

  const go = (t) => {
    if (t.external) {
      window.open(t.path, '_blank', 'noopener,noreferrer')
    } else {
      router.push(t.path)
    }
    setOpen(false)
  }

  const isActive = (t) => !t.external && (pathname === t.path || (t.path !== '/' && pathname.startsWith(t.path)))

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 58,
        background: 'var(--brand)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 18px', boxShadow: '0 2px 12px rgba(201,18,42,.3)',
      }}>
        {/* Brand */}
        <button onClick={() => router.push('/faculty')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.png" alt="KL University" style={{ height: 46, width: 'auto', maxWidth: 220, display: 'block' }} />
        </button>

        {/* Desktop tabs */}
        <div className="hide-mobile" style={{ display: 'flex', height: 58, alignItems: 'stretch' }}>
          {TABS.map(t => (
            <button key={t.path} onClick={() => go(t)} style={{
              background: 'transparent', border: 'none', color: isActive(t) ? '#fff' : 'rgba(255,255,255,.75)',
              padding: '0 15px', fontWeight: t.bold ? 700 : 600, fontSize: 13.5,
              borderBottom: isActive(t) ? '3px solid rgba(255,255,255,.9)' : '3px solid transparent',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
              whiteSpace: 'nowrap',
            }}>
              {t.label}{t.external ? ' ↗' : ''}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && (
            <button onClick={onManageData} title="Manage Data" style={iconBtnStyle}>
              <FolderOpen size={17} />
            </button>
          )}
          <button onClick={toggleTheme} title="Toggle theme" style={iconBtnStyle}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button onClick={logout} title="Logout" style={iconBtnStyle}>
            <Lock size={16} />
          </button>
          <button
            className="hide-desktop"
            onClick={() => setOpen(o => !o)}
            style={{ ...iconBtnStyle, display: 'none' }}
            id="hamburger"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div style={{
          position: 'fixed', top: 58, left: 0, right: 0,
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          zIndex: 999, boxShadow: 'var(--shadow-md)',
        }}>
          {TABS.map(t => (
            <button key={t.path} onClick={() => go(t)} style={{
              display: 'block', width: '100%', padding: '14px 20px',
              textAlign: 'left', background: isActive(t) ? 'var(--brand-light)' : 'transparent',
              border: 'none', borderBottom: '1px solid var(--border)',
              color: isActive(t) ? 'var(--brand)' : 'var(--text)',
              fontWeight: t.bold ? 700 : 600, fontSize: 15,
              borderLeft: isActive(t) ? '4px solid var(--brand)' : '4px solid transparent',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {t.label}{t.external ? ' ↗' : ''}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @media(max-width:768px){ #hamburger{ display:flex !important } }
        @media(min-width:769px){ #hamburger{ display:none !important } }
      `}</style>
    </>
  )
}

const iconBtnStyle = {
  background: 'rgba(255,255,255,.15)', border: 'none', color: 'white',
  width: 34, height: 34, borderRadius: '50%', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background .15s',
}
