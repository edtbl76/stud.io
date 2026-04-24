/**
 * @jest-environment node
 */
import { GET } from '@/app/api/gearlist/photos/[...key]/route'
import { NextRequest } from 'next/server'

const mockGet = jest.fn()

jest.mock('@aws-sdk/client-s3', () => {
  process.env.MINIO_ACCESS_KEY = 'test-access-key'
  process.env.MINIO_SECRET_KEY = 'test-secret-key'
  const send = jest.fn()
  return {
    S3Client: jest.fn(() => ({ send })),
    GetObjectCommand: jest.fn(),
    NoSuchKey: class NoSuchKey extends Error {
      constructor() { super('NoSuchKey'); this.name = 'NoSuchKey' }
    },
    __send: send,
  }
})

jest.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: mockGet }),
}))

const s3Mock = jest.requireMock('@aws-sdk/client-s3') as {
  __send: jest.Mock
  NoSuchKey: new () => Error
}

const PARAMS = { params: Promise.resolve({ key: ['guitars', 'abc123.jpg'] }) }

function mockFetchOk() {
  global.fetch = jest.fn().mockResolvedValue({ ok: true })
}

beforeEach(() => {
  s3Mock.__send.mockReset()
  mockGet.mockReset()
  mockGet.mockImplementation((name: string) =>
    name === 'controlroom_token' ? { value: 'test-token' } : undefined,
  )
  mockFetchOk()
})

describe('GET /api/gearlist/photos/[...key]', () => {
  it('returns 401 and skips S3 when no auth cookie', async () => {
    mockGet.mockReturnValue(undefined)
    const req = new NextRequest('http://localhost/api/gearlist/photos/guitars/abc123.jpg')
    const res = await GET(req, PARAMS)
    expect(res.status).toBe(401)
    expect(s3Mock.__send).not.toHaveBeenCalled()
  })

  it('returns 401 and skips S3 when backend rejects token', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false })
    const req = new NextRequest('http://localhost/api/gearlist/photos/guitars/abc123.jpg')
    const res = await GET(req, PARAMS)
    expect(res.status).toBe(401)
    expect(s3Mock.__send).not.toHaveBeenCalled()
  })

  it('validates token against backend /auth/me with Bearer scheme', async () => {
    s3Mock.__send.mockResolvedValue({
      ContentType: 'image/jpeg',
      Body: { transformToWebStream: () => new ReadableStream() },
    })
    const req = new NextRequest('http://localhost/api/gearlist/photos/guitars/abc123.jpg')
    await GET(req, PARAMS)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me'),
      expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer test-token' }) }),
    )
  })

  it('returns 200 with content-type and content-length for found object', async () => {
    s3Mock.__send.mockResolvedValue({
      ContentType: 'image/jpeg',
      ContentLength: 12345,
      Body: { transformToWebStream: () => new ReadableStream() },
    })
    const req = new NextRequest('http://localhost/api/gearlist/photos/guitars/abc123.jpg')
    const res = await GET(req, PARAMS)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('content-length')).toBe('12345')
  })

  it('passes joined key segments as S3 object key', async () => {
    s3Mock.__send.mockResolvedValue({
      ContentType: 'image/jpeg',
      Body: { transformToWebStream: () => new ReadableStream() },
    })
    const req = new NextRequest('http://localhost/api/gearlist/photos/guitars/abc123.jpg')
    await GET(req, PARAMS)
    const { GetObjectCommand } = jest.requireMock('@aws-sdk/client-s3') as { GetObjectCommand: jest.Mock }
    expect(GetObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: 'guitars/abc123.jpg' }),
    )
  })

  it('returns 404 when object key does not exist', async () => {
    s3Mock.__send.mockRejectedValue(new s3Mock.NoSuchKey())
    const req = new NextRequest('http://localhost/api/gearlist/photos/missing.jpg')
    const res = await GET(req, { params: Promise.resolve({ key: ['missing.jpg'] }) })
    expect(res.status).toBe(404)
  })

  it('returns 502 and logs the error on unexpected S3 error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const cause = new Error('Connection refused')
    s3Mock.__send.mockRejectedValue(cause)
    const req = new NextRequest('http://localhost/api/gearlist/photos/guitars/abc123.jpg')
    const res = await GET(req, PARAMS)
    expect(res.status).toBe(502)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('S3 error'), cause)
    consoleSpy.mockRestore()
  })
})
