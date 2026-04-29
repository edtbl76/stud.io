import { redirect } from 'next/navigation'

// Search has moved to /search. Redirect preserves the query string.
export default function LegacySearchRedirect({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const q = searchParams.q
  redirect(q ? `/search?q=${encodeURIComponent(q)}` : '/search')
}
