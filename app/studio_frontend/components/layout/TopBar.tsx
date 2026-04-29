'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

export function TopBar() {
  const router = useRouter()
  const [query, setQuery] = React.useState('')

  function handleSearch(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = query.trim()
    if (q.length < 2) return
    router.push(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-12 flex items-center px-4 border-b border-border bg-background">
      <form onSubmit={handleSearch} className="w-full max-w-md mx-auto">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/40 border border-border/50">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search everything..."
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </form>
    </header>
  )
}
