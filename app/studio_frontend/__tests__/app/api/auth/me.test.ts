/**
 * @jest-environment node
 */
import { GET } from '@/app/api/auth/me/route'

const mockGet = jest.fn()
jest.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: mockGet }),
}))

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  mockGet.mockReset()
})

describe('GET /api/auth/me', () => {
  it('returns 401 immediately when no token cookie is present', async () => {
    mockGet.mockReturnValue(undefined)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('proxies to backend and returns user when token is valid', async () => {
    mockGet.mockImplementation((name: string) =>
      name === 'controlroom_token' ? { value: 'valid-token' } : undefined,
    )
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ username: 'admin', role: 'admin' }),
    })

    const res = await GET()
    const body = await res.json() as { username: string; role: string }

    expect(res.status).toBe(200)
    expect(body).toEqual({ username: 'admin', role: 'admin' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me'),
      expect.objectContaining({ headers: { authorization: 'Bearer valid-token' } }),
    )
  })

  it('returns 401 when backend rejects the token', async () => {
    mockGet.mockImplementation((name: string) =>
      name === 'controlroom_token' ? { value: 'expired-token' } : undefined,
    )
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

    const res = await GET()

    expect(res.status).toBe(401)
  })
})
