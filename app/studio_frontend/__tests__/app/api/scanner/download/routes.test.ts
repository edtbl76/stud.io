/** @jest-environment node */

// Tests for the scanner download Next.js API routes.
// Mocks the S3 singleton and session cookie validation.

jest.mock('@/app/api/scanner/download/_s3', () => ({
  PREFIX: 'plugin-scanner/',
  requireSession: jest.fn(),
  listReleases: jest.fn(),
  presignDownload: jest.fn(),
}))

import { GET as latestGET } from '@/app/api/scanner/download/latest/route'
import { GET as historyGET } from '@/app/api/scanner/download/history/route'
import { GET as urlGET } from '@/app/api/scanner/download/url/route'
import * as s3mod from '@/app/api/scanner/download/_s3'
import { NextRequest } from 'next/server'

const { requireSession, listReleases, presignDownload } = s3mod as jest.Mocked<typeof s3mod>

const RELEASE = {
  key: 'plugin-scanner/plugin-scanner-v1.0.0-20260501T000000Z-darwin-arm64.zip',
  version: 'v1.0.0-20260501T000000Z',
  released_at: '2026-05-01T00:00:00.000Z',
  size_bytes: 12345678,
}

beforeEach(() => {
  jest.clearAllMocks()
  requireSession.mockResolvedValue(null)
})

describe('GET /api/scanner/download/latest', () => {
  it('returns 401 when unauthenticated', async () => {
    requireSession.mockResolvedValue(new Response(null, { status: 401 }) as never)
    const res = await latestGET()
    expect(res.status).toBe(401)
  })

  it('returns 204 when no releases exist', async () => {
    listReleases.mockResolvedValue([])
    const res = await latestGET()
    expect(res.status).toBe(204)
  })

  it('returns latest release', async () => {
    listReleases.mockResolvedValue([RELEASE])
    const res = await latestGET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.version).toBe(RELEASE.version)
  })

  it('returns 502 on S3 error', async () => {
    listReleases.mockRejectedValue(new Error('S3 down'))
    const res = await latestGET()
    expect(res.status).toBe(502)
  })
})

describe('GET /api/scanner/download/history', () => {
  it('returns all releases except the first', async () => {
    const older = { ...RELEASE, key: 'plugin-scanner/old.zip', version: 'v0.9.0' }
    listReleases.mockResolvedValue([RELEASE, older])
    const res = await historyGET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].version).toBe('v0.9.0')
  })

  it('returns empty array when only one release exists', async () => {
    listReleases.mockResolvedValue([RELEASE])
    const res = await historyGET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveLength(0)
  })

  it('returns 502 on S3 error', async () => {
    listReleases.mockRejectedValue(new Error('S3 down'))
    const res = await historyGET()
    expect(res.status).toBe(502)
  })
})

describe('GET /api/scanner/download/url', () => {

    return new NextRequest(`http://localhost/api/scanner/download/url?key=${encodeURIComponent(key)}`)
  }

  it('returns presigned URL for valid key', async () => {
    presignDownload.mockResolvedValue('https://minio/presigned')
    const res = await urlGET(makeRequest(RELEASE.key))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.url).toBe('https://minio/presigned')
  })

  it('returns 400 for key without plugin-scanner/ prefix', async () => {
    const res = await urlGET(makeRequest('other-bucket/evil.zip'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when key is missing', async () => {
    const res = await urlGET(new NextRequest('http://localhost/api/scanner/download/url'))
    expect(res.status).toBe(400)
  })

  it('returns 502 on presign error', async () => {
    presignDownload.mockRejectedValue(new Error('S3 error'))
    const res = await urlGET(makeRequest(RELEASE.key))
    expect(res.status).toBe(502)
  })
})
