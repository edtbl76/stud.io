/**
 * @jest-environment node
 */
import { createSession } from '@/app/api/auth/session'

const mockSet = jest.fn()
jest.mock('next/headers', () => ({
  cookies: () => ({ set: mockSet }),
}))

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  mockSet.mockReset()
})

describe('createSession', () => {
  it('fetches /auth/me, sets httpOnly cookie, and returns username/role', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ username: 'admin', role: 'admin', user_id: '1' }),
    })

    const result = await createSession('jwt-token')

    expect(result).toEqual({ username: 'admin', role: 'admin' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me'),
      expect.objectContaining({ headers: { authorization: 'Bearer jwt-token' } }),
    )
    expect(mockSet).toHaveBeenCalledWith(
      'controlroom_token',
      'jwt-token',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' }),
    )
  })

  it('sets cookie maxAge to 8 hours', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ username: 'u', role: 'user' }),
    })

    await createSession('tok')

    expect(mockSet).toHaveBeenCalledWith(
      'controlroom_token',
      'tok',
      expect.objectContaining({ maxAge: 60 * 480 }),
    )
  })
})
