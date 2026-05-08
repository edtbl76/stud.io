import { NextRequest, NextResponse } from 'next/server'
import { requireSession, getObject, PREFIX } from '../_s3'

export async function GET(request: NextRequest) {
  const unauth = await requireSession()
  if (unauth) return unauth

  const key = request.nextUrl.searchParams.get('key')
  if (!key?.startsWith(PREFIX)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }

  try {
    const { body, contentLength } = await getObject(key)
    const filename = key.split('/').pop() ?? 'plugin-scanner.zip'
    const headers: Record<string, string> = {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    }
    if (contentLength) headers['Content-Length'] = String(contentLength)
    return new NextResponse(body, { headers })
  } catch {
    return NextResponse.json({ error: 'Failed to download file' }, { status: 502 })
  }
}
