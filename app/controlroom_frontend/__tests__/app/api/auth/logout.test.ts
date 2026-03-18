/**
 * @jest-environment node
 */
import { POST } from '@/app/api/auth/logout/route'

const mockDelete = jest.fn()
jest.mock('next/headers', () => ({
  cookies: () => ({ delete: mockDelete }),
}))

beforeEach(() => {
  mockDelete.mockReset()
})

describe('POST /api/auth/logout', () => {
  it('deletes the session cookie', async () => {
    const res = await POST()
    expect(mockDelete).toHaveBeenCalledWith('controlroom_token')
    expect(res.status).toBe(200)
  })

  it('returns ok: true', async () => {
    const res = await POST()
    const data = await res.json()
    expect(data).toEqual({ ok: true })
  })
})
