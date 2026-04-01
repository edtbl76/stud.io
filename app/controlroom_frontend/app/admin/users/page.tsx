'use client'

import * as React from 'react'
import Script from 'next/script'
import { Trash2, Plus, KeyRound, Loader2, CheckCircle, AlertCircle, X, Link2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''

interface User {
  user_id: string
  username: string
  role: string
  google_linked: boolean
  created_at: string
}

type Status = { type: 'success' | 'error'; message: string } | null

function StatusMessage({ status, onDismiss }: Readonly<{ status: NonNullable<Status>; onDismiss: () => void }>) {
  return (
    <div className={`flex items-center gap-2 mt-3 text-xs ${
      status.type === 'success' ? 'text-green-400' : 'text-destructive'
    }`}>
      {status.type === 'success'
        ? <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
        : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />}
      <span className="flex-1">{status.message}</span>
      <button onClick={onDismiss} className="ml-1 opacity-60 hover:opacity-100">
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export default function UsersPage() {
  const { username: currentUsername } = useAuth()
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
  const [status, setStatus] = React.useState<Status>(null)

  // Add user form
  const [newUsername, setNewUsername] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [addLoading, setAddLoading] = React.useState(false)

  // Change password inline
  const [changingId, setChangingId] = React.useState<string | null>(null)
  const [newPw, setNewPw] = React.useState('')
  const [pwLoading, setPwLoading] = React.useState(false)

  // Google link — stores the user_id we're linking for the GIS callback
  const linkingUserIdRef = React.useRef<string | null>(null)

  async function fetchUsers() {
    const res = await fetch('/api/users', { headers: { 'Content-Type': 'application/json' } })
    if (res.ok) setUsers(await res.json())
  }

  React.useEffect(() => {
    fetchUsers().finally(() => setLoading(false))
  }, [])

  async function callApi(
    url: string,
    init: RequestInit,
    successMsg: string,
    fallbackError: string,
  ): Promise<void> {
    setStatus(null)
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? res.statusText)
      }
      setStatus({ type: 'success', message: successMsg })
      await fetchUsers()
    } catch (e) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : fallbackError })
    }
  }

  async function _handleLinkResponse(credential: string) {
    const userId = linkingUserIdRef.current
    if (!userId) return
    linkingUserIdRef.current = null
    await callApi(
      `/api/users/${userId}/google`,
      { method: 'PATCH', body: JSON.stringify({ credential }) },
      'Google account linked',
      'Failed to link Google account',
    )
  }

  function initGoogle() {
    const gApi = globalThis.window?.google
    if (!GOOGLE_CLIENT_ID || !gApi) return
    gApi.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => { void _handleLinkResponse(response.credential) },
    })
  }

  function handleLinkGoogle(userId: string) {
    const gApi = globalThis.window?.google
    if (!gApi) return
    linkingUserIdRef.current = userId
    gApi.accounts.id.prompt()
  }

  async function handleAdd(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setAddLoading(true)
    setStatus(null)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? res.statusText)
      }
      setNewUsername('')
      setNewPassword('')
      setStatus({ type: 'success', message: `User "${newUsername}" created` })
      await fetchUsers()
    } catch (e) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'Failed to create user' })
    } finally {
      setAddLoading(false)
    }
  }

  async function handleToggleRole(user: User) {
    const newRole = user.role === 'admin' ? 'user' : 'admin'
    await callApi(
      `/api/users/${user.user_id}/role`,
      { method: 'PATCH', body: JSON.stringify({ role: newRole }) },
      `${user.username} is now ${newRole}`,
      'Failed to change role',
    )
  }

  async function handleDelete(user: User) {
    await callApi(
      `/api/users/${user.user_id}`,
      { method: 'DELETE' },
      `User "${user.username}" deleted`,
      'Failed to delete user',
    )
  }

  async function handleChangePassword(userId: string) {
    setPwLoading(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/users/${userId}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPw }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? res.statusText)
      }
      setStatus({ type: 'success', message: 'Password updated' })
      setChangingId(null)
      setNewPw('')
    } catch (e) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'Failed to update password' })
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full px-6 py-6 max-w-2xl">
      {GOOGLE_CLIENT_ID && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={initGoogle}
        />
      )}

      <h2 className="text-lg font-semibold text-foreground mb-1">Users</h2>
      <p className="text-xs text-muted-foreground mb-8">
        Manage accounts that can log into ControlRoom.
      </p>

      {/* User list */}
      <section className="mb-8">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 font-medium">Username</th>
                <th className="text-left py-2 font-medium">Role</th>
                <th className="text-left py-2 font-medium">Created</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <React.Fragment key={u.user_id}>
                  <tr className="border-b border-border/50">
                    <td className="py-2 text-foreground">
                      {u.username}
                      {u.username === currentUsername && (
                        <span className="ml-2 text-muted-foreground">(you)</span>
                      )}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => handleToggleRole(u)}
                        disabled={u.username === currentUsername}
                        title={`Switch to ${u.role === 'admin' ? 'user' : 'admin'}`}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                          u.role === 'admin'
                            ? 'bg-primary/20 text-primary hover:bg-primary/30'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {u.role}
                      </button>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {GOOGLE_CLIENT_ID && u.username === currentUsername && !u.google_linked && (
                          <button
                            onClick={() => handleLinkGoogle(u.user_id)}
                            title="Link Google account"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setChangingId(changingId === u.user_id ? null : u.user_id)
                            setNewPw('')
                            setStatus(null)
                          }}
                          title="Change password"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          disabled={u.username === currentUsername}
                          title="Delete user"
                          className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {changingId === u.user_id && (
                    <tr className="border-b border-border/50 bg-muted/30">
                      <td colSpan={4} className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value={newPw}
                            onChange={(e) => setNewPw(e.target.value)}
                            placeholder="New password"
                            autoFocus
                            className="flex-1 rounded border border-border bg-muted px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            onClick={() => handleChangePassword(u.user_id)}
                            disabled={!newPw || pwLoading}
                            className="flex items-center gap-1 px-3 py-1 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
                          >
                            {pwLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                            Save
                          </button>
                          <button
                            onClick={() => { setChangingId(null); setNewPw('') }}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}

        {status && <StatusMessage status={status} onDismiss={() => setStatus(null)} />}
      </section>

      <div className="border-t border-border mb-8" />

      {/* Add user */}
      <section>
        <h3 className="text-sm font-medium text-foreground mb-4">Add User</h3>
        <form onSubmit={(e) => { void handleAdd(e) }} className="flex items-end gap-3">
          <div>
            <label htmlFor="new-username" className="block text-xs text-muted-foreground mb-1.5">Username</label>
            <input
              id="new-username"
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
              className="rounded border border-border bg-muted px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="new-password" className="block text-xs text-muted-foreground mb-1.5">Password</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="rounded border border-border bg-muted px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={addLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {addLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add User
          </button>
        </form>
      </section>
    </div>
  )
}
