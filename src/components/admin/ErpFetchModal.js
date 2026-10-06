'use client'
/**
 * ErpFetchModal
 * ─────────────
 * Opened from the Roomwise Timetable card. Logs in to the KL ERP with an
 * admin's own faculty account (captcha, plus an MFA code when the account has
 * MFA) and pulls the Room-wise TT directly, replacing the active Roomwise
 * snapshot. The password goes to the ERP once via /api/admin/erp-fetch and is
 * never stored.
 */
import { useState, useEffect } from 'react'
import { useApi } from '@/components/AuthContext'
import toast from 'react-hot-toast'
import { RefreshCw, X } from 'lucide-react'

export default function ErpFetchModal({ onClose, onFetched }) {
  const { get, post } = useApi()

  const [captchaImg, setCaptchaImg] = useState(null)
  const [options,    setOptions]    = useState(null)
  const [loadingCap, setLoadingCap] = useState(false)
  const [fetching,   setFetching]   = useState(false)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [captcha,  setCaptcha]  = useState('')
  const [mfaCode,  setMfaCode]  = useState('')
  const [mfa,      setMfa]      = useState(null)   // true / false from the ERP, null = unknown
  const [checkingMfa, setCheckingMfa] = useState(false)
  const [academicyear, setAcademicyear] = useState(29)
  const [semesterid,   setSemesterid]   = useState(1)

  useEffect(() => { loadCaptcha() }, [])

  const loadCaptcha = async () => {
    setLoadingCap(true)
    setCaptcha('')
    try {
      const d = await get('/api/admin/erp-fetch')
      if (!d.success) throw new Error(d.message)
      setCaptchaImg(d.captcha)
      if (!options) {
        setOptions(d.options)
        setAcademicyear(d.defaults.academicyear)
        setSemesterid(d.defaults.semesterid)
      }
    } catch (err) { toast.error(err.message) }
    finally { setLoadingCap(false) }
  }

  const lookupMfa = async () => {
    const u = username.trim()
    if (!u || !captchaImg) return
    setCheckingMfa(true)
    try {
      const d = await post('/api/admin/erp-fetch', { action: 'mfa', username: u })
      if (!d.success) throw new Error(d.message)
      setMfa(d.mfa)
    } catch { setMfa(null) }   // unknown — the MFA box stays optional
    finally { setCheckingMfa(false) }
  }

  const fetchRooms = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password || !captcha.trim())
      return toast.error('Enter ERP username, password and captcha')
    if (mfa === true && !/^\d{6}$/.test(mfaCode.trim()))
      return toast.error('This account has MFA — enter the 6-digit code')
    if (mfaCode.trim() && !/^\d{6}$/.test(mfaCode.trim()))
      return toast.error('MFA code must be exactly six digits')
    setFetching(true)
    try {
      const d = await post('/api/admin/erp-fetch', {
        action: 'fetch', username: username.trim(), password, captcha: captcha.trim(),
        mfaCode: mfaCode.trim(), campid: 1, academicyear, semesterid,
      })
      if (!d.success) throw new Error(d.message)
      toast.success(`Fetched from ERP — ${d.inserted.toLocaleString()} slot entries`)
      onFetched?.()
      onClose()
    } catch (err) {
      toast.error(err.message)
      // The captcha is single-use; get a fresh one for the next attempt.
      setPassword('')
      loadCaptcha()
    } finally { setFetching(false) }
  }

  const label = { fontSize: 12, color: 'var(--text-3)', marginBottom: 4, display: 'block' }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16,
    }}
      onClick={e => e.target === e.currentTarget && !fetching && onClose()}>
      <div className="card fade-up" style={{ width: '100%', maxWidth: 520, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🔐 Fetch Roomwise Timetable from ERP</div>
          <button className="btn btn-ghost" onClick={onClose} disabled={fetching}
            title="Close" style={{ padding: '4px 6px' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 18 }}>
          Log in with your KL ERP faculty account to pull the Day Room Timetable directly.
          It replaces the active Roomwise TT. Your password goes to the ERP only and is not saved.
        </div>

        <form onSubmit={fetchRooms} autoComplete="off"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div>
            <label style={label}>ERP username</label>
            <input className="input" value={username} autoComplete="username" autoFocus
              onChange={e => { setUsername(e.target.value); setMfa(null) }}
              onBlur={lookupMfa} />
            {checkingMfa && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Checking MFA…</div>}
          </div>
          <div>
            <label style={label}>ERP password</label>
            <input className="input" type="password" value={password} autoComplete="current-password"
              onChange={e => setPassword(e.target.value)} />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label}>Captcha</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {captchaImg
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={captchaImg} alt="ERP captcha" style={{ height: 38, borderRadius: 6, background: '#fff' }} />
                : <span style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 100 }}>{loadingCap ? 'Loading…' : 'No captcha'}</span>}
              <button type="button" className="btn btn-ghost" onClick={loadCaptcha} disabled={loadingCap}
                title="New captcha" style={{ padding: '6px 8px' }}>
                <RefreshCw size={14} style={loadingCap ? { animation: 'spin 1s linear infinite' } : undefined} />
              </button>
              <input className="input" value={captcha} placeholder="Enter the code shown"
                onChange={e => setCaptcha(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
            </div>
          </div>
          <div>
            <label style={label}>
              MFA code {mfa === true ? '(required)' : '(blank if not enabled)'}
            </label>
            <input className="input" inputMode="numeric" maxLength={6} value={mfaCode}
              placeholder={mfa === false ? 'Not needed' : '6-digit code'}
              onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))} />
          </div>

          <div>
            <label style={label}>Campus</label>
            <select className="input" value={1} disabled>
              {(options?.campuses || [{ id: 1, label: 'KLVZA' }]).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Academic year</label>
            <select className="input" value={academicyear} onChange={e => setAcademicyear(Number(e.target.value))}>
              {options?.academicYears.map(y => <option key={y.id} value={y.id}>{y.label}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Semester</label>
            <select className="input" value={semesterid} onChange={e => setSemesterid(Number(e.target.value))}>
              {options?.semesters.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={fetching}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={fetching || checkingMfa || !captchaImg}>
              {fetching ? 'Logging in & downloading…' : '⬇ Fetch Room Timetable'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
