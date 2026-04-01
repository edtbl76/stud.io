import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const BACKEND = process.env.BACKEND_URL ?? 'http://controlroom_backend:5150'

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params
  const search = req.nextUrl.search
  const backendUrl = `${BACKEND}/${path.join('/')}${search}`

  const cookieStore = await cookies()
  const token = cookieStore.get('controlroom_token')?.value

  const headers: Record<string, string> = {}
  const contentType = req.headers.get('content-type')
  if (contentType) headers['content-type'] = contentType
  if (token) headers['authorization'] = `Bearer ${token}`

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const body = hasBody ? await req.arrayBuffer() : undefined

  const res = await fetch(backendUrl, {
    method: req.method,
    headers,
    ...(body?.byteLength ? { body } : {}),
  })

  const responseHeaders = new Headers()
  const ct = res.headers.get('content-type')
  if (ct) responseHeaders.set('content-type', ct)
  const cd = res.headers.get('content-disposition')
  if (cd) responseHeaders.set('content-disposition', cd)

  return new NextResponse(res.body, { status: res.status, headers: responseHeaders })
}

export const GET = proxy
export const POST = proxy
export const PATCH = proxy
export const DELETE = proxy
