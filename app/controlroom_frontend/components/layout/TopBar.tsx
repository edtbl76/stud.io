'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface TopBarProps {
  title: string
}

export function TopBar({ title }: Readonly<TopBarProps>) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <h1 className="text-base font-semibold text-foreground">{title}</h1>
      <form onSubmit={handleSearch} className="relative w-64">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Global search..."
          className="pl-8 h-8 text-xs"
        />
      </form>
    </div>
  )
}
