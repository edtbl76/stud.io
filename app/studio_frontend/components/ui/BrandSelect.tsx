'use client'

import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Brand } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

interface BrandSelectProps {
  readonly value: string       // brand_id or ''
  readonly displayName: string // brand_name for display
  readonly onChange: (id: string, name: string) => void
  readonly placeholder?: string
}

export function BrandSelect({
  value,
  displayName,
  onChange,
  placeholder = 'Search brands...',
}: BrandSelectProps) {
  const [query, setQuery] = React.useState(displayName)
  const [results, setResults] = React.useState<Brand[]>([])
  const [open, setOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [createError, setCreateError] = React.useState<string | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => { setQuery(displayName) }, [displayName])

  React.useEffect(() => {
    if (!open) return
    const timer = setTimeout(async () => {
      if (!query.trim()) { setResults([]); return }
      try {
        const data = await api.listPaged<Brand>('/studio/catalog/brands', { limit: 50, filters: { name: { value: query, operator: 'contains' } } })
        setResults(data.items)
      } catch {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, open])

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const createMutation = useMutation({
    mutationFn: () => api.create<Brand>('/studio/catalog/brands', { brand_name: newName.trim() }),
    onSuccess: (brand) => {
      const name = brand.brand_name ?? newName.trim()
      onChange(brand.brand_id, name)
      setQuery(name)
      setOpen(false)
      setCreating(false)
      setNewName('')
      setCreateError(null)
    },
    onError: (err) => setCreateError(err instanceof Error ? err.message : 'Create failed'),
  })

  function select(brand: Brand) {
    onChange(brand.brand_id, brand.brand_name ?? '')
    setQuery(brand.brand_name ?? '')
    setOpen(false)
    setCreating(false)
  }

  function clear() {
    onChange('', '')
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const exactMatch = results.some(b => (b.brand_name ?? '').toLowerCase() === query.toLowerCase())
  const showCreate = query.trim().length > 0 && !exactMatch

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setCreating(false) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pr-7"
        />
        {(value || query) && (
          <button type="button" onClick={clear} className="absolute right-2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (results.length > 0 || showCreate) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-card shadow-xl max-h-48 overflow-y-auto">
          <div className="p-1">
            {results.map(brand => (
              <button
                key={brand.brand_id}
                type="button"
                onClick={() => select(brand)}
                className={cn(
                  'flex w-full items-center rounded px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors',
                  value === brand.brand_id && 'text-primary'
                )}
              >
                {brand.brand_name}
              </button>
            ))}
            {showCreate && !creating && (
              <button
                type="button"
                onClick={() => { setCreating(true); setNewName(query.trim()) }}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm text-left text-primary hover:bg-muted transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Create &quot;{query.trim()}&quot;
              </button>
            )}
            {creating && (
              <div className="px-2 py-2 flex flex-col gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Brand name"
                  className="h-7 text-xs"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createMutation.mutate() } }}
                  autoFocus
                />
                {createError && <p className="text-xs text-destructive">{createError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => createMutation.mutate()}
                    disabled={!newName.trim() || createMutation.isPending}
                    className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50"
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="px-2 py-1 text-xs rounded border border-border hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
