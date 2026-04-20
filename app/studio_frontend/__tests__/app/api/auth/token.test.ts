/**
 * @jest-environment node
 */
import { POST } from '@/app/api/auth/token/route'
import { createSession } from '@/app/api/auth/session'
import { NextRequest } from 'next/server'

jest.mock('@/app/api/auth/session', () => ({
  BACKEND: 'http://mock-backend',
  createSession: jest.fn(),
}))

const mockCreateSession = createSession as jest.Mock

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  mockCreateSession.mockReset()
})

function makeReq(body = 'username=admin&password=admin') {
  return new NextRequest('http://localhost/api/auth/token', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  })
}

describe('POST /api/auth/token', () => {
  it('calls createSession and returns username/role on valid credentials', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'jwt-abc' }),
    })
    mockCreateSession.mockResolvedValueOnce({ username: 'admin', role: 'admin' })

    const res = await POST(makeReq())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({ username: 'admin', role: 'admin' })
    expect(mockCreateSession).toHaveBeenCalledWith('jwt-abc')
  })

  it('forwards the form body to the backend', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok' }),
    })
    mockCreateSession.mockResolvedValueOnce({ username: 'alice', role: 'user' })

    await POST(makeReq('username=alice&password=secret'))

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/token'),
      expect.objectContaining({ body: 'username=alice&password=secret' }),
    )
  })

  it('returns error status and body when backend rejects credentials', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Incorrect username or password' }),
    })

    const res = await POST(makeReq('username=bad&password=bad'))
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data).toEqual({ detail: 'Incorrect username or password' })
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('returns fallback message when backend returns non-JSON error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => { throw new Error('not json') },
    })

    const res = await POST(makeReq())
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data).toEqual({ detail: 'Login failed' })
  })
})
