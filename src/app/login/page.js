'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AuthProvider, useAuth } from '@/components/AuthContext'
import toast from 'react-hot-toast'

function LoginForm() {
  const { login, user, loading } = useAuth()
  const router = useRouter()
  const [eid,  setEid]  = useState('')
  const [pw,   setPw]   = useState('')
  const [busy, setBusy] = useState(false)
  const [dark, setDark] = useState(false)

  useEffect(() => {
    if (!loading && user) router.replace('/faculty')
  }, [user, loading])

  useEffect(() => {
    setDark(localStorage.getItem('klef_theme') === 'dark')
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await login(eid.trim(), pw)
      if (res.mustChangePassword) {
        toast('Please set a new password to continue.', { icon: '🔑' })
        router.replace('/change-password')
      } else {
        toast.success(`Welcome, ${res.user?.display_name || res.user?.eid || 'User'}!`)
        router.replace('/faculty')
      }
    } catch (err) {
      toast.error(err.message || 'Invalid credentials')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center',
      background: 'var(--bg)', padding: 20,
    }}>
      <div className="card fade-up" style={{ maxWidth: 400, width: '100%', padding: 40, textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dark ? '/logo-dark.png' : '/logo-light.png'}
          alt="KL University"
          style={{ height: 64, width: 'auto', maxWidth: 260, display: 'block', margin: '0 auto 20px' }}
        />

        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.7rem', color: 'var(--brand)', margin: '0 0 6px' }}>
          KL Timetable
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 14, margin: '0 0 28px' }}>
          Sign in with your Employee ID
        </p>

        <form onSubmit={submit}>
          <input
            className="input"
            type="text"
            placeholder="Employee ID (EID) or Username"
            value={eid}
            onChange={e => setEid(e.target.value)}
            style={{ marginBottom: 10, fontSize: 15 }}
            autoFocus
            autoComplete="username"
            inputMode="text"
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            style={{ marginBottom: 16, fontSize: 15 }}
            autoComplete="current-password"
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !pw || !eid}
            style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 15 }}
          >
            {busy ? 'Verifying…' : 'Login'}
          </button>
        </form>

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
