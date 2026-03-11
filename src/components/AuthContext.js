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

  return (
    <AuthCtx.Provider value={{
      user, loading, login, logout, refreshUser,
      isAdmin:   user?.role === 'admin',
      isFaculty: user?.role === 'faculty',
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

  const get = (url) =>
    fetch(url, { headers: getHeaders() }).then(r => r.json())

  const post = (url, body) =>
    fetch(url, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) }).then(r => r.json())

  const postForm = (url, formData) => {
    const token = localStorage.getItem('klef_token')
    return fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(r => r.json())
  }

  const del = (url) =>
    fetch(url, { method: 'DELETE', headers: getHeaders() }).then(r => r.json())

  return { get, post, postForm, del }
}
