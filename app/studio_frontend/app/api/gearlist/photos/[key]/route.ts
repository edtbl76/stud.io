import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { S3Client, GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? 'http://studio_minio:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? '',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? '',
  },
  forcePathStyle: true,
})

const BUCKET = process.env.MINIO_BUCKET ?? 'studio-photos'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const cookieStore = await cookies()
  if (!cookieStore.get('controlroom_token')) {
    return new NextResponse(null, { status: 401 })
  }

  const { key } = await params

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    const headers = new Headers()
    if (obj.ContentType) headers.set('content-type', obj.ContentType)
    if (obj.ContentLength) headers.set('content-length', String(obj.ContentLength))
    return new NextResponse(obj.Body?.transformToWebStream() ?? null, { status: 200, headers })
  } catch (err) {
    if (err instanceof NoSuchKey) return new NextResponse(null, { status: 404 })
    return new NextResponse(null, { status: 502 })
  }
}
