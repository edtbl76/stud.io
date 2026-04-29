import { redirect } from 'next/navigation'

// Search has moved to /search. Redirect preserves the query string.
export default async function LegacySearchRedirect({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const q = params.q
  redirect(q ? `/search?q=${encodeURIComponent(q)}` : '/search')
}
