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

async function performLogin(user: string, password: string): Promise<{ username: string; role: string }> {
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
  return res.json() as Promise<{ username: string; role: string }>
}

async function performGoogleLogin(credential: string): Promise<{ username: string; role: string }> {
  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Google login failed' }))
    throw new Error(err.detail ?? 'Google login failed')
  }
  return res.json() as Promise<{ username: string; role: string }>
}

function redirectIfNeeded(
  checked: boolean,
  username: string | null,
  pathname: string,
  router: ReturnType<typeof useRouter>,
): void {
  if (!checked) return
  if (!username && pathname !== '/login') router.replace('/login')
  if (username && pathname === '/login') router.replace('/')
}

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
    redirectIfNeeded(checked, username, pathname, router)
  }, [checked, username, pathname, router])

  const login = React.useCallback(async (user: string, password: string) => {
    const data = await performLogin(user, password)
    setUsername(data.username)
    setRole(data.role)
  }, [])

  const loginGoogle = React.useCallback(async (credential: string) => {
    const data = await performGoogleLogin(credential)
    setUsername(data.username)
    setRole(data.role)
  }, [])

  const logout = React.useCallback(() => {
    void fetch('/api/auth/logout', { method: 'POST' })
    setUsername(null)
    setRole(null)
    router.replace('/login')
  }, [router])

  const value = React.useMemo(
    () => ({ username, role, login, loginGoogle, logout }),
    [username, role, login, loginGoogle, logout],
  )

  if (!checked) return (
    <div className="flex items-center justify-center h-screen">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
