'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AuthProvider, useAuth } from '@/components/AuthContext'
import toast from 'react-hot-toast'

function LoginForm() {
  const { login, user, loading } = useAuth()
  const router = useRouter()
  const [pw, setPw]           = useState('')
  const [busy, setBusy]       = useState(false)
  const [adminMode, setAdmin] = useState(false)
  const [username, setUname]  = useState('')

  useEffect(() => {
    if (!loading && user) router.replace('/faculty')
  }, [user, loading])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await login(adminMode ? username.trim() : 'viewer', pw)
      toast.success('Welcome!')
      router.replace('/faculty')
    } catch {
      toast.error(adminMode ? 'Invalid credentials' : 'Incorrect password')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  return (
    <div style={{
      minHeight:'100vh', display:'flex', justifyContent:'center', alignItems:'center',
      background:'var(--bg)', padding:20,
    }}>
      <div className="card fade-up" style={{ maxWidth:400, width:'100%', padding:40, textAlign:'center' }}>
        {/* Logo area */}
        <div style={{
          width:64, height:64, background:'var(--brand)', borderRadius:16,
          display:'flex', alignItems:'center', justifyContent:'center',
          margin:'0 auto 20px', fontSize:28, boxShadow:'0 4px 20px rgba(201,18,42,.3)',
        }}>
          🎓
        </div>

        <h1 style={{
          fontFamily:"'DM Serif Display', serif",
          fontSize:'1.7rem', color:'var(--brand)', margin:'0 0 6px',
        }}>
          KL Timetable
        </h1>
        <p style={{ color:'var(--text-3)', fontSize:14, margin:'0 0 28px' }}>
          Timetable & Scheduling System
        </p>

        <form onSubmit={submit}>
          {adminMode && (
            <input
              className="input"
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUname(e.target.value)}
              style={{ marginBottom:10, fontSize:15 }}
              autoFocus
              autoComplete="username"
            />
          )}
          <input
            className="input"
            type="password"
            placeholder={adminMode ? 'Password' : 'Enter portal password'}
            value={pw}
            onChange={e => setPw(e.target.value)}
            style={{
              textAlign: adminMode ? 'left' : 'center',
              marginBottom:16, fontSize:15,
              letterSpacing: adminMode ? 0 : 2,
            }}
            autoFocus={!adminMode}
            autoComplete="current-password"
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !pw || (adminMode && !username)}
            style={{ width:'100%', justifyContent:'center', padding:'12px', fontSize:15 }}
          >
            {busy ? 'Verifying…' : adminMode ? 'Admin Login' : 'Enter Portal'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setAdmin(a => !a); setPw(''); setUname('') }}
          style={{
            marginTop:16, background:'none', border:'none', cursor:'pointer',
            fontSize:12, color:'var(--text-3)', textDecoration:'underline', padding:0,
          }}
        >
          {adminMode ? '← Back to viewer login' : 'Admin login'}
        </button>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  )
}
