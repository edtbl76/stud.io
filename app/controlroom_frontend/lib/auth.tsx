'use client'

import * as React from 'react'
import { useRouter, usePathname } from 'next/navigation'


interface AuthContextValue {
  username: string | null
  role: string | null
  login: (username: string, password: string) => Promise<void>
  loginGoogle: (credential: string) => Promise<void>
  logout: () => void
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [username, setUsername] = React.useState<string | null>(null)
  const [role, setRole] = React.useState<string | null>(null)
  const [checked, setChecked] = React.useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // On mount, check for an existing session via the httpOnly cookie
  React.useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => {
        if (!r.ok) throw new Error('not authenticated')
        return r.json()
      })
      .then((data: { username: string; role: string }) => {
        setUsername(data.username)
        setRole(data.role)
      })
      .catch(() => {
        // No valid session — leave username null
      })
      .finally(() => setChecked(true))
  }, [])

  // Redirect unauthenticated users away from protected pages
  React.useEffect(() => {
    if (!checked) return
    if (!username && pathname !== '/login') router.replace('/login')
    if (username && pathname === '/login') router.replace('/')
  }, [checked, username, pathname, router])

  async function login(user: string, password: string) {
    const form = new URLSearchParams()
    form.append('username', user)
    form.append('password', password)

    const res = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Login failed' }))
      throw new Error(err.detail ?? 'Login failed')
    }
    const data = (await res.json()) as { username: string; role: string }
    setUsername(data.username)
    setRole(data.role)
  }

  async function loginGoogle(credential: string) {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Google login failed' }))
      throw new Error(err.detail ?? 'Google login failed')
    }
    const data = (await res.json()) as { username: string; role: string }
    setUsername(data.username)
    setRole(data.role)
  }

  function logout() {
    void fetch('/api/auth/logout', { method: 'POST' })
    setUsername(null)
    setRole(null)
    router.replace('/login')
  }

  const value = React.useMemo(
    () => ({ username, role, login, loginGoogle, logout }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [username, role],
  )

  if (!checked) return null

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
