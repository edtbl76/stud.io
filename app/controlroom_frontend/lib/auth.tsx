'use client'

import * as React from 'react'
import { useRouter, usePathname } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5150'
const TOKEN_KEY = 'controlroom_token'

interface AuthContextValue {
  token: string | null
  username: string | null
  role: string | null
  login: (username: string, password: string) => Promise<void>
  loginGoogle: (credential: string) => Promise<void>
  logout: () => void
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(null)
  const [username, setUsername] = React.useState<string | null>(null)
  const [role, setRole] = React.useState<string | null>(null)
  const [checked, setChecked] = React.useState(false)
  const router = useRouter()
  const pathname = usePathname()

  async function _applyToken(accessToken: string) {
    localStorage.setItem(TOKEN_KEY, accessToken)
    setToken(accessToken)
    const me = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const meData = await me.json()
    setUsername(meData.username)
    setRole(meData.role)
  }

  // On mount, restore token from localStorage and validate it
  React.useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (!stored) {
      setChecked(true)
      return
    }
    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error('invalid')
        return r.json()
      })
      .then((data) => {
        setToken(stored)
        setUsername(data.username)
        setRole(data.role)
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
      })
      .finally(() => setChecked(true))
  }, [])

  // Redirect unauthenticated users away from protected pages
  React.useEffect(() => {
    if (!checked) return
    if (!token && pathname !== '/login') {
      router.replace('/login')
    }
    if (token && pathname === '/login') {
      router.replace('/')
    }
  }, [checked, token, pathname, router])

  async function login(user: string, password: string) {
    const form = new URLSearchParams()
    form.append('username', user)
    form.append('password', password)

    const res = await fetch(`${API}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Login failed' }))
      throw new Error(err.detail ?? 'Login failed')
    }
    const data = await res.json()
    await _applyToken(data.access_token)
  }

  async function loginGoogle(credential: string) {
    const res = await fetch(`${API}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Google login failed' }))
      throw new Error(err.detail ?? 'Google login failed')
    }
    const data = await res.json()
    await _applyToken(data.access_token)
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUsername(null)
    setRole(null)
    router.replace('/login')
  }

  // Don't render children until we've checked the stored token
  if (!checked) return null

  return (
    <AuthContext.Provider value={{ token, username, role, login, loginGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
