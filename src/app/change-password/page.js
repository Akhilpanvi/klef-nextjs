'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AuthProvider, useAuth, useApi } from '@/components/AuthContext'
import toast from 'react-hot-toast'

function ChangePasswordForm() {
  const { user, loading, refreshUser } = useAuth()
  const { post } = useApi()
  const router = useRouter()

  const [current, setCurrent] = useState('')
  const [next,    setNext]    = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy,    setBusy]    = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading])

  const submit = async (e) => {
    e.preventDefault()
    if (next !== confirm) return toast.error('Passwords do not match')
    if (next.length < 6)  return toast.error('Minimum 6 characters required')
    setBusy(true)
    try {
      const d = await post('/api/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      })
      if (!d.success) throw new Error(d.message)
      await refreshUser()
      toast.success('Password changed! Welcome.')
      router.replace('/faculty')
    } catch (err) {
      toast.error(err.message || 'Failed to change password')
    } finally {
      setBusy(false)
    }
  }

  if (loading || !user) return null

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center',
      background: 'var(--bg)', padding: 20,
    }}>
      <div className="card fade-up" style={{ maxWidth: 420, width: '100%', padding: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: 'var(--brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, margin: '0 auto 16px',
          }}>🔑</div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.5rem', color: 'var(--text)', margin: '0 0 6px' }}>
            Set New Password
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>
            {user?.mustChangePassword ? 'First login — please set a secure password.' : 'Change your account password.'}
          </p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
              Current Password (your EID)
            </label>
            <input
              className="input"
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              placeholder="Enter your EID as current password"
              autoFocus
              autoComplete="current-password"
              style={{ fontSize: 15 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
              New Password
            </label>
            <input
              className="input"
              type="password"
              value={next}
              onChange={e => setNext(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              style={{ fontSize: 15 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
              Confirm New Password
            </label>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat new password"
              autoComplete="new-password"
              style={{ fontSize: 15 }}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !current || !next || !confirm}
            style={{ marginTop: 8, width: '100%', justifyContent: 'center', padding: '12px', fontSize: 15 }}
          >
            {busy ? 'Saving…' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ChangePasswordPage() {
  return (
    <AuthProvider>
      <ChangePasswordForm />
    </AuthProvider>
  )
}
