import { cookies } from 'next/headers'

const BACKEND = process.env.BACKEND_URL ?? 'http://controlroom_backend:5150'
const COOKIE_MAX_AGE = 60 * 480 // 8 hours

export { BACKEND }

/**
 * Exchange an access token for user info, set the session cookie, and return
 * { username, role } to the caller.
 */
export async function createSession(
  access_token: string,
): Promise<{ username: string; role: string }> {
  const meRes = await fetch(`${BACKEND}/auth/me`, {
    headers: { authorization: `Bearer ${access_token}` },
  })
  const user = (await meRes.json()) as { username: string; role: string }

  const cookieStore = await cookies()
  cookieStore.set('controlroom_token', access_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })

  return { username: user.username, role: user.role }
}
