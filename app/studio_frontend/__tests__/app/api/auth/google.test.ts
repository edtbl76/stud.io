/**
 * @jest-environment node
 */
import { POST } from '@/app/api/auth/google/route'
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

function makeReq(credential = 'google-id-token') {
  return new NextRequest('http://localhost/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/auth/google', () => {
  it('calls createSession and returns username/role on valid Google credential', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'jwt-google' }),
    })
    mockCreateSession.mockResolvedValueOnce({ username: 'carol', role: 'user' })

    const res = await POST(makeReq())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({ username: 'carol', role: 'user' })
    expect(mockCreateSession).toHaveBeenCalledWith('jwt-google')
  })

  it('returns error status when backend rejects Google credential', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Google account not linked' }),
    })

    const res = await POST(makeReq())
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data).toEqual({ detail: 'Google account not linked' })
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('returns fallback message when backend returns non-JSON error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json') },
    })

    const res = await POST(makeReq())
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data).toEqual({ detail: 'Google login failed' })
  })
})
