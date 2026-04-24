/**
 * @jest-environment node
 */
import { GET } from '@/app/api/gearlist/photos/[key]/route'
import { NextRequest } from 'next/server'

const mockGet = jest.fn()

jest.mock('@aws-sdk/client-s3', () => {
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

const PARAMS = { params: Promise.resolve({ key: 'guitars/abc123.jpg' }) }

beforeEach(() => {
  s3Mock.__send.mockReset()
  mockGet.mockReset()
  mockGet.mockImplementation((name: string) =>
    name === 'controlroom_token' ? { value: 'test-token' } : undefined,
  )
})

describe('GET /api/gearlist/photos/[key]', () => {
  it('returns 401 and skips S3 when no auth cookie', async () => {
    mockGet.mockReturnValue(undefined)
    const req = new NextRequest('http://localhost/api/gearlist/photos/guitars/abc123.jpg')
    const res = await GET(req, PARAMS)
    expect(res.status).toBe(401)
    expect(s3Mock.__send).not.toHaveBeenCalled()
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

  it('returns 404 when object key does not exist', async () => {
    s3Mock.__send.mockRejectedValue(new s3Mock.NoSuchKey())
    const req = new NextRequest('http://localhost/api/gearlist/photos/missing.jpg')
    const res = await GET(req, { params: Promise.resolve({ key: 'missing.jpg' }) })
    expect(res.status).toBe(404)
  })

  it('returns 502 on unexpected S3 error', async () => {
    s3Mock.__send.mockRejectedValue(new Error('Connection refused'))
    const req = new NextRequest('http://localhost/api/gearlist/photos/guitars/abc123.jpg')
    const res = await GET(req, PARAMS)
    expect(res.status).toBe(502)
  })
})
