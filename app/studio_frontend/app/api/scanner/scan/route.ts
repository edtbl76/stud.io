import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL ?? 'http://controlroom_backend:5150'

export async function POST(request: NextRequest) {
  const body = await request.arrayBuffer()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const auth = request.headers.get('Authorization')
  const idempotencyKey = request.headers.get('X-Idempotency-Key')
  if (auth) headers['Authorization'] = auth
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey

  const res = await fetch(`${BACKEND}/scanner/scan`, { method: 'POST', headers, body })
  const data = await res.arrayBuffer()
  return new NextResponse(data, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  })
}
