import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { BACKEND } from '../session'

export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies()
  const token = cookieStore.get('controlroom_token')?.value

  if (!token) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 })
  }

  const res = await fetch(`${BACKEND}/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    return NextResponse.json({ detail: 'Invalid token' }, { status: res.status })
  }

  const user = (await res.json()) as { username: string; role: string }
  return NextResponse.json(user)
}
