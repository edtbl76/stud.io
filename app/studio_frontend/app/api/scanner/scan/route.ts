import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL ?? 'http://controlroom_backend:5150'

export async function POST(request: NextRequest) {
  const body = await request.arrayBuffer()
  const res = await fetch(`${BACKEND}/scanner/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': request.headers.get('Authorization') ?? '',
      'X-Idempotency-Key': request.headers.get('X-Idempotency-Key') ?? '',
    },
    body,
  })
  const data = await res.arrayBuffer()
  return new NextResponse(data, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  })
}
