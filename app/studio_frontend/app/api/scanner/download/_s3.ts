import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const BUCKET = process.env.SCANNER_DOWNLOADS_BUCKET ?? 'studio-downloads'
export const PREFIX = 'plugin-scanner/'
const BACKEND = process.env.BACKEND_URL ?? 'http://controlroom_backend:5150'

let s3: S3Client | null = null

function getS3(): S3Client {
  s3 ??= new S3Client({
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://studiominio:9000',
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? '',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? '',
    },
    forcePathStyle: true,
  })
  return s3
}

const AUTH_TIMEOUT_MS = 5_000

export async function requireSession(): Promise<NextResponse | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('controlroom_token')
  if (!token) return new NextResponse(null, { status: 401 })
  try {
    const res = await fetch(`${BACKEND}/auth/me`, {
      headers: { authorization: `Bearer ${token.value}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    })
    if (!res.ok) return new NextResponse(null, { status: 401 })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return new NextResponse(null, { status: 401 })
    }
    throw err
  }
  return null
}

export interface ReleaseObject {
  key: string
  version: string
  released_at: string
  size_bytes: number
}

function parseVersion(key: string): string {
  const base = key.replace(PREFIX, '').replace('.zip', '')
  const versionRe = /^plugin-scanner-(.+)-darwin/
  const match = versionRe.exec(base)
  return match ? match[1] : base
}

export async function listReleases(): Promise<ReleaseObject[]> {
  const result = await getS3().send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX }))
  return (result.Contents ?? [])
    .filter(obj => obj.Key && obj.Key !== PREFIX)
    .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
    .map(obj => ({
      key: obj.Key!,
      version: parseVersion(obj.Key!),
      released_at: obj.LastModified?.toISOString() ?? '',
      size_bytes: obj.Size ?? 0,
    }))
}

export interface ObjectStream {
  body: ReadableStream
  contentLength?: number
}

export async function getObject(key: string): Promise<ObjectStream> {
  const result = await getS3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  return {
    body: result.Body!.transformToWebStream(),
    contentLength: result.ContentLength,
  }
}
