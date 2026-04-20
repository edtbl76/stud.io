import { NextRequest, NextResponse } from 'next/server'
import { BACKEND, createSession } from '../session'

export async function POST(req: NextRequest) {
  const body = await req.text()

  const tokenRes = await fetch(`${BACKEND}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({ detail: 'Login failed' }))
    return NextResponse.json(err, { status: tokenRes.status })
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string }
  const user = await createSession(access_token)
  return NextResponse.json(user)
}
