import { NextRequest, NextResponse } from 'next/server'
import { requireSession, presignDownload, PREFIX } from '../_s3'

export async function GET(request: NextRequest) {
  const unauth = await requireSession()
  if (unauth) return unauth

  const key = request.nextUrl.searchParams.get('key')
  if (!key?.startsWith(PREFIX)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }

  try {
    const url = await presignDownload(key)
    return NextResponse.json({ url })
  } catch {
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 502 })
  }
}
