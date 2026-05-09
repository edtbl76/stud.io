import { NextResponse } from 'next/server'
import { requireSession, listReleases } from '../_s3'

export async function GET() {
  const unauth = await requireSession()
  if (unauth) return unauth

  try {
    const releases = await listReleases()
    if (releases.length === 0) return new NextResponse(null, { status: 204 })
    return NextResponse.json(releases[0])
  } catch {
    return NextResponse.json({ error: 'Failed to fetch latest release' }, { status: 502 })
  }
}
