import { NextResponse } from 'next/server'
import { requireSession, listReleases } from '../_s3'

export async function GET() {
  const unauth = await requireSession()
  if (unauth) return unauth

  try {
    const releases = await listReleases()
    return NextResponse.json(releases.slice(1))
  } catch {
    return NextResponse.json({ error: 'Failed to fetch release history' }, { status: 502 })
  }
}
