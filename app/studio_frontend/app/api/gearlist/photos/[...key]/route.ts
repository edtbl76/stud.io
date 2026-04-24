import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { S3Client, GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

let s3: S3Client | null = null
let bucket: string | null = null

function getS3(): { client: S3Client; bucket: string } {
  if (!s3 || !bucket) {
    s3 = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT ?? 'http://studio_minio:9000',
      region: 'us-east-1',
      credentials: {
        accessKeyId: requireEnv('MINIO_ACCESS_KEY'),
        secretAccessKey: requireEnv('MINIO_SECRET_KEY'),
      },
      forcePathStyle: true,
    })
    bucket = process.env.MINIO_BUCKET ?? 'studio-photos'
  }
  return { client: s3, bucket }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<NextResponse> {
  const cookieStore = await cookies()
  const token = cookieStore.get('controlroom_token')
  if (!token) {
    return new NextResponse(null, { status: 401 })
  }
  const backend = process.env.BACKEND_URL ?? 'http://controlroom_backend:5150'
  const meRes = await fetch(`${backend}/auth/me`, {
    headers: { authorization: `Bearer ${token.value}` },
  })
  if (!meRes.ok) {
    return new NextResponse(null, { status: 401 })
  }
  // Phase 4: enforce key-level authorization once gear ownership is modeled

  const { key } = await params
  const { client, bucket: s3Bucket } = getS3()

  try {
    const obj = await client.send(new GetObjectCommand({ Bucket: s3Bucket, Key: key.join('/') }))
    const headers = new Headers()
    if (obj.ContentType) headers.set('content-type', obj.ContentType)
    if (obj.ContentLength) headers.set('content-length', String(obj.ContentLength))
    return new NextResponse(obj.Body?.transformToWebStream() ?? null, { status: 200, headers })
  } catch (err) {
    if (err instanceof NoSuchKey) return new NextResponse(null, { status: 404 })
    console.error('[gearlist/photos] S3 error:', err)
    return new NextResponse(null, { status: 502 })
  }
}
