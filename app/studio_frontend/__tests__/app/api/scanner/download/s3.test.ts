/** @jest-environment node */

// Unit tests for the _s3 helper module.
// Mocks the AWS SDK and next/headers so no real S3 calls are made.

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  ListObjectsV2Command: jest.fn(),
  GetObjectCommand: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    get: jest.fn().mockReturnValue({ value: 'test-token' }),
  }),
}))

global.fetch = jest.fn()

import { listReleases, getObject, requireSession, PREFIX } from '@/app/api/scanner/download/_s3'
import { S3Client } from '@aws-sdk/client-s3'
import { cookies } from 'next/headers'

const mockSend = jest.fn()
;(S3Client as jest.Mock).mockImplementation(() => ({ send: mockSend }))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('listReleases', () => {
  it('returns sorted releases excluding prefix-only entries', async () => {
    mockSend.mockResolvedValue({
      Contents: [
        { Key: PREFIX, LastModified: new Date('2026-05-01'), Size: 0 },
        { Key: `${PREFIX}plugin-scanner-v1.0.0-20260501T000000Z-darwin-arm64.zip`, LastModified: new Date('2026-05-01'), Size: 1000 },
        { Key: `${PREFIX}plugin-scanner-v2.0.0-20260506T000000Z-darwin-arm64.zip`, LastModified: new Date('2026-05-06'), Size: 2000 },
      ],
    })
    const releases = await listReleases()
    expect(releases).toHaveLength(2)
    expect(releases[0].version).toContain('v2.0.0')
    expect(releases[0].size_bytes).toBe(2000)
    expect(releases[1].version).toContain('v1.0.0')
  })

  it('returns empty array when no objects exist', async () => {
    mockSend.mockResolvedValue({ Contents: [] })
    const releases = await listReleases()
    expect(releases).toHaveLength(0)
  })

  it('handles missing Contents gracefully', async () => {
    mockSend.mockResolvedValue({})
    const releases = await listReleases()
    expect(releases).toHaveLength(0)
  })
})

describe('getObject', () => {
  it('returns body stream and contentLength', async () => {
    const mockStream = new ReadableStream()
    mockSend.mockResolvedValue({
      Body: { transformToWebStream: () => mockStream },
      ContentLength: 5678,
    })
    const result = await getObject(`${PREFIX}file.zip`)
    expect(result.body).toBe(mockStream)
    expect(result.contentLength).toBe(5678)
  })
})

describe('requireSession', () => {
  it('returns null when session is valid', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })
    const result = await requireSession()
    expect(result).toBeNull()
  })

  it('returns 401 response when /auth/me fails', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })
    const result = await requireSession()
    expect(result?.status).toBe(401)
  })

  it('returns 401 response when no token cookie', async () => {
    ;(cookies as jest.Mock).mockResolvedValueOnce({ get: jest.fn().mockReturnValue(null) })
    const result = await requireSession()
    expect(result?.status).toBe(401)
  })

  it('returns 401 response when fetch times out', async () => {
    const err = new DOMException('signal timed out', 'TimeoutError')
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(err)
    const result = await requireSession()
    expect(result?.status).toBe(401)
  })

  it('re-throws non-timeout errors', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('network failure'))
    await expect(requireSession()).rejects.toThrow('network failure')
  })
})
