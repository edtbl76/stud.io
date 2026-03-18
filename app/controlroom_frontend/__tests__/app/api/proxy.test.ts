/**
 * @jest-environment node
 */
import { GET, POST, PATCH, DELETE } from '@/app/api/[...path]/route'
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
jest.mock('next/headers', () => ({
  cookies: () => ({ get: mockGet }),
}))

const mockFetch = jest.fn()
global.fetch = mockFetch

const PARAMS = { params: { path: ['effects'] } }

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    body: JSON.stringify(body),
    headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
  }
}

beforeEach(() => {
  mockFetch.mockReset()
  mockGet.mockReset()
  mockGet.mockImplementation((name: string) =>
    name === 'controlroom_token' ? { value: 'test-token' } : undefined,
  )
})

describe('proxy route', () => {
  it('forwards GET with Authorization header from cookie', async () => {
    mockFetch.mockResolvedValue(jsonResponse([{ id: '1' }]))

    const req = new NextRequest('http://localhost/api/effects')
    await GET(req, PARAMS)

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/effects'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bearer test-token' }),
      }),
    )
  })

  it('forwards query string to backend', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))

    const req = new NextRequest('http://localhost/api/effects?q=piano')
    await GET(req, PARAMS)

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/effects?q=piano'),
      expect.anything(),
    )
  })

  it('does not include Authorization header when no cookie', async () => {
    mockGet.mockReturnValue(undefined)
    mockFetch.mockResolvedValue(jsonResponse([]))

    const req = new NextRequest('http://localhost/api/effects')
    await GET(req, PARAMS)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(init.headers.authorization).toBeUndefined()
  })

  it('forwards POST with JSON body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: '1' }, 201))

    const req = new NextRequest('http://localhost/api/effects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Reverb' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req, PARAMS)

    expect(res.status).toBe(201)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    )
  })

  it('forwards PATCH request', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: '1', name: 'Updated' }))

    const req = new NextRequest('http://localhost/api/effects', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated' }),
      headers: { 'content-type': 'application/json' },
    })
    await PATCH(req, PARAMS)

    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('forwards DELETE request', async () => {
    mockFetch.mockResolvedValue({ status: 204, body: null, headers: { get: () => null } })

    const req = new NextRequest('http://localhost/api/effects/1', { method: 'DELETE' })
    const res = await DELETE(req, { params: { path: ['effects', '1'] } })

    expect(res.status).toBe(204)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/effects/1'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('forwards content-disposition header for binary responses', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      body: 'binary',
      headers: {
        get: (h: string) => {
          if (h === 'content-type') return 'application/octet-stream'
          if (h === 'content-disposition') return 'attachment; filename=backup.sql'
          return null
        },
      },
    })

    const req = new NextRequest('http://localhost/api/admin/backup')
    const res = await GET(req, { params: { path: ['admin', 'backup'] } })

    expect(res.headers.get('content-disposition')).toBe('attachment; filename=backup.sql')
  })

  it('returns backend error status', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ detail: 'Not found' }, 404))

    const req = new NextRequest('http://localhost/api/effects/999')
    const res = await GET(req, { params: { path: ['effects', '999'] } })

    expect(res.status).toBe(404)
  })
})
