/**
 * Tests for lib/auth.tsx
 * Covers: AuthProvider rendering, useAuth hook, login, loginGoogle, logout
 */
import React from 'react'
import { render, screen, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../../lib/auth'

const mockReplace = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/login',
}))

beforeEach(() => {
  mockReplace.mockClear()
  ;(global.fetch as jest.Mock) = jest.fn()
})

// Helper: render a component that calls useAuth
function AuthConsumer() {
  const auth = useAuth()
  return (
    <div>
      <span data-testid="username">{auth.username ?? 'none'}</span>
      <span data-testid="role">{auth.role ?? 'none'}</span>
      <button onClick={auth.logout}>logout</button>
    </div>
  )
}

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<AuthConsumer />)).toThrow('useAuth must be used inside AuthProvider')
    spy.mockRestore()
  })
})

describe('AuthProvider', () => {
  it('renders accessible loading state while session check is in flight', () => {
    ;(global.fetch as jest.Mock).mockReturnValueOnce(new Promise(() => {})) // never resolves

    const { container } = render(
      <AuthProvider>
        <span data-testid="child">hello</span>
      </AuthProvider>,
    )

    const status = screen.getByRole('status')
    expect(status.tagName.toLowerCase()).toBe('output')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
  })

  it('renders children after session check with no active session', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false })

    render(
      <AuthProvider>
        <span data-testid="child">hello</span>
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('child')).toBeInTheDocument())
  })

  it('restores session on mount by calling /api/auth/me', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ username: 'alice', role: 'admin' }),
    })

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('username').textContent).toBe('alice'))
    expect(screen.getByTestId('role').textContent).toBe('admin')
    expect((global.fetch as jest.Mock)).toHaveBeenCalledWith('/api/auth/me')
  })

  it('leaves username null when /api/auth/me returns 401', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false })

    render(
      <AuthProvider>
        <span data-testid="child">hello</span>
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('child')).toBeInTheDocument())
    expect(screen.queryByTestId('username')).not.toBeInTheDocument()
  })

  it('login posts to /api/auth/token and sets username/role', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false }) // initial /api/auth/me check
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ username: 'bob', role: 'user' }),
      })

    let authRef: ReturnType<typeof useAuth> = null!
    function Grabber() {
      authRef = useAuth()
      return <span data-testid="username">{authRef.username ?? 'none'}</span>
    }

    render(
      <AuthProvider>
        <Grabber />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('username')).toBeInTheDocument())

    await act(async () => {
      await authRef.login('bob', 'pass')
    })

    expect(screen.getByTestId('username').textContent).toBe('bob')
    expect((global.fetch as jest.Mock)).toHaveBeenCalledWith(
      '/api/auth/token',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('login throws on failed response', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false }) // initial /api/auth/me check
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Invalid credentials' }),
      })

    let authRef: ReturnType<typeof useAuth> = null!
    function Grabber() {
      authRef = useAuth()
      return <span data-testid="grabber" />
    }

    render(
      <AuthProvider>
        <Grabber />
      </AuthProvider>,
    )

    // Wait until AuthProvider finishes its /api/auth/me check and renders children
    await waitFor(() => screen.getByTestId('grabber'))

    await expect(authRef.login('bad', 'creds')).rejects.toThrow('Invalid credentials')
  })

  it('loginGoogle posts to /api/auth/google and sets username/role', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false }) // initial /api/auth/me check
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ username: 'carol', role: 'user' }),
      })

    let authRef: ReturnType<typeof useAuth> = null!
    function Grabber() {
      authRef = useAuth()
      return <span data-testid="username">{authRef.username ?? 'none'}</span>
    }

    render(
      <AuthProvider>
        <Grabber />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('username')).toBeInTheDocument())

    await act(async () => {
      await authRef.loginGoogle('google-credential')
    })

    expect(screen.getByTestId('username').textContent).toBe('carol')
    expect((global.fetch as jest.Mock)).toHaveBeenCalledWith(
      '/api/auth/google',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('logout clears state, posts to /api/auth/logout, and redirects to /login', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ username: 'alice', role: 'admin' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }) // logout

    let authRef: ReturnType<typeof useAuth> = null!
    function Grabber() {
      authRef = useAuth()
      return <span data-testid="username">{authRef.username ?? 'none'}</span>
    }

    render(
      <AuthProvider>
        <Grabber />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('username').textContent).toBe('alice'))

    await act(async () => { await authRef.logout() })

    expect(screen.getByTestId('username').textContent).toBe('none')
    expect(mockReplace).toHaveBeenCalledWith('/login')
  })

  it('logout does not clear state when the server returns a non-OK response', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ username: 'alice', role: 'admin' }),
      })
      .mockResolvedValueOnce({ ok: false }) // logout fails

    let authRef: ReturnType<typeof useAuth> = null!
    function Grabber() {
      authRef = useAuth()
      return <span data-testid="username">{authRef.username ?? 'none'}</span>
    }

    render(
      <AuthProvider>
        <Grabber />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('username').textContent).toBe('alice'))

    await expect(act(async () => { await authRef.logout() })).rejects.toThrow('Logout failed')

    expect(screen.getByTestId('username').textContent).toBe('alice')
    expect(mockReplace).not.toHaveBeenCalledWith('/login')
  })

  it('logout does not clear state when the network request fails', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ username: 'alice', role: 'admin' }),
      })
      .mockRejectedValueOnce(new Error('Network error'))

    let authRef: ReturnType<typeof useAuth> = null!
    function Grabber() {
      authRef = useAuth()
      return <span data-testid="username">{authRef.username ?? 'none'}</span>
    }

    render(
      <AuthProvider>
        <Grabber />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('username').textContent).toBe('alice'))

    await expect(act(async () => { await authRef.logout() })).rejects.toThrow('Network error')

    expect(screen.getByTestId('username').textContent).toBe('alice')
    expect(mockReplace).not.toHaveBeenCalledWith('/login')
  })
})
