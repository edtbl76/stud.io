/** @jest-environment node */

global.fetch = jest.fn()

jest.mock('next/headers', () => ({ cookies: jest.fn() }))

import { GET } from '@/app/api/scanner/exclusions/route'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

const mockFetch = global.fetch as jest.Mock
const mockCookies = cookies as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeRequest(auth?: string) {
  const headers: Record<string, string> = {}
  if (auth) headers['Authorization'] = auth
  return new NextRequest('http://localhost/api/scanner/exclusions', { headers })
}

function mockBackend(status: number, body: unknown) {
  mockFetch.mockResolvedValue({
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
  })
}

describe('GET /api/scanner/exclusions', () => {
  it('forwards Authorization header to backend when present', async () => {
    mockBackend(200, [])
    await GET(makeRequest('Bearer psc_test'))
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/scanner/exclusions'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer psc_test' }),
      })
    )
  })

  it('uses session cookie when no Authorization header', async () => {
    mockCookies.mockResolvedValue({ get: (name: string) => name === 'controlroom_token' ? { value: 'session-jwt' } : undefined })
    mockBackend(200, [])
    await GET(makeRequest())
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/scanner/exclusions'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-jwt' }),
      })
    )
  })

  it('forwards 401 from backend', async () => {
    mockCookies.mockResolvedValue({ get: () => undefined })
    mockBackend(401, { detail: 'Authentication required' })
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns backend body and Content-Type', async () => {
    const payload = [{ vendor: 'Waves', name: 'SSL', format: 'VST3' }]
    mockBackend(200, payload)
    const res = await GET(makeRequest('Bearer psc_test'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(payload)
  })
})
