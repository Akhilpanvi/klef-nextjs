'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  const token = typeof window !== 'undefined' ? localStorage.getItem('klef_token') : null

  useEffect(() => {
    if (!token) { setLoading(false); return }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setUser(d.user) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username, password) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const d = await r.json()
    if (!d.success) throw new Error(d.message || 'Login failed')
    localStorage.setItem('klef_token', d.token)
    setUser(d.user)
    return d   // full response so caller can check mustChangePassword
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('klef_token')
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const t = localStorage.getItem('klef_token')
    if (!t) return
    const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${t}` } })
    const d = await r.json()
    if (d.success) setUser(d.user)
  }, [])

  const isAdmin   = user?.role === 'admin'
  const isFaculty = user?.role === 'faculty'

  // Returns true if user is admin OR has been granted the specific permission
  const hasPermission = useCallback((perm) => {
    if (!user) return false
    if (user.role === 'admin') return true
    return Array.isArray(user.permissions) && user.permissions.includes(perm)
  }, [user])

  return (
    <AuthCtx.Provider value={{
      user, loading, login, logout, refreshUser,
      isAdmin, isFaculty, hasPermission,
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)

// ── Tiny fetch wrapper that auto-attaches Bearer token ────────────────────────
export function useApi() {
  const getHeaders = (extra = {}) => {
    const token = localStorage.getItem('klef_token')
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }
  }

  /**
   * Read a response as JSON, but report what actually happened when it is not.
   *
   * Calling r.json() blindly turned a gateway timeout or an HTML error page
   * into "The string did not match the expected pattern." in Safari, which
   * says nothing about the real failure. Check the status and content type
   * first and surface the server's own message.
   */
  const asJson = async (r) => {
    const type = r.headers.get('content-type') || ''
    if (type.includes('application/json')) {
      const body = await r.json()
      if (!r.ok && !body?.message) {
        throw new Error(`Request failed (${r.status} ${r.statusText || ''})`.trim())
      }
      return body
    }
    const text = (await r.text()).trim()
    if (r.status === 504 || r.status === 408)
      throw new Error('The server took too long to respond. Narrow the day or hour selection and try again.')
    if (r.status === 413)
      throw new Error('That selection returns too much data. Narrow the day or hour selection and try again.')
    const snippet = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 160)
    throw new Error(
      r.ok
        ? `Unexpected non-JSON response from ${url0(r)}${snippet ? `: ${snippet}` : ''}`
        : `Request failed (${r.status})${snippet ? `: ${snippet}` : ''}`)
  }
  const url0 = r => { try { return new URL(r.url).pathname } catch { return 'server' } }

  const get = (url) =>
    fetch(url, { headers: getHeaders() }).then(asJson)

  const post = (url, body) =>
    fetch(url, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) }).then(asJson)

  const postForm = (url, formData) => {
    const token = localStorage.getItem('klef_token')
    return fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(asJson)
  }

  const del = (url) =>
    fetch(url, { method: 'DELETE', headers: getHeaders() }).then(asJson)

  const patch = (url, body) =>
    fetch(url, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(body) }).then(asJson)

  return { get, post, postForm, del, patch }
}
