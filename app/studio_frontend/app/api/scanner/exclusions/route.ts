import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const BACKEND = process.env.BACKEND_URL ?? 'http://controlroom_backend:5150'

export async function GET(request: NextRequest) {
  const headers: Record<string, string> = {}
  const auth = request.headers.get('Authorization')
  if (auth) {
    headers['Authorization'] = auth
  } else {
    const cookieStore = await cookies()
    const token = cookieStore.get('controlroom_token')?.value
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BACKEND}/scanner/exclusions`, { headers })
  const data = await res.arrayBuffer()
  return new NextResponse(data, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  })
}
