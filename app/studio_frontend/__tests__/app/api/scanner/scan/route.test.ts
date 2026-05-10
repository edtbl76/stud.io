/** @jest-environment node */

global.fetch = jest.fn()

import { POST } from '@/app/api/scanner/scan/route'
import { NextRequest } from 'next/server'

const mockFetch = global.fetch as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeRequest(body = '{"plugins":[]}', auth = 'Bearer psc_test', idempotencyKey = 'uuid-1') {
  return new NextRequest('http://localhost/api/scanner/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': auth,
      'X-Idempotency-Key': idempotencyKey,
    },
    body,
  })
}

describe('POST /api/scanner/scan', () => {
  it('proxies request to backend and returns response', async () => {
    const payload = { scan_id: 'abc', matched: 1 }
    mockFetch.mockResolvedValue({
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(payload)).buffer,
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/scanner/scan'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Authorization': 'Bearer psc_test' }),
      })
    )
  })

  it('forwards 401 from backend', async () => {
    mockFetch.mockResolvedValue({
      status: 401,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('forwards X-Idempotency-Key header', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    })
    await POST(makeRequest('{}', 'Bearer key', 'my-idempotency-key'))
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Idempotency-Key': 'my-idempotency-key' }),
      })
    )
  })
})
