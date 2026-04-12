'use client'

import * as React from 'react'
import { X, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { loadRecents, pushRecent } from '@/lib/parentSelectRecents'
import type { ParentRef } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface EntityResult {
  table_name: string
  id: string
  name: string
  brand_name: string | null
}

interface ParentId {
  table_name: string
  id: string
}

interface ParentSelectProps {
  value: ParentId[]
  selectedParents: ParentRef[]
  onChange: (ids: ParentId[], parents: ParentRef[]) => void
  excludeTable?: string
  excludeId?: string
  placeholder?: string
}

function entityDisplayName(result: EntityResult): string {
  return result.brand_name ? `${result.brand_name} – ${result.name}` : result.name
}

export function ParentSelect({
  value,
  selectedParents,
  onChange,
  excludeTable = '',
  excludeId = '',
  placeholder = 'Search parents...',
}: Readonly<ParentSelectProps>) {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<EntityResult[]>([])
  const [recents, setRecents] = React.useState<ParentRef[]>([])
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([])
        setRecents(loadRecents())
        return
      }
      try {
        const data = await api.searchEntities(query.trim(), excludeTable, excludeId)
        setResults(data.results)
      } catch {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, open, excludeTable, excludeId])

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggleEntry(tableName: string, id: string, nameForNew: string) {
    const isSelec = value.some(v => v.table_name === tableName && v.id === id)
    if (isSelec) {
      onChange(
        value.filter(v => !(v.table_name === tableName && v.id === id)),
        selectedParents.filter(p => !(p.table_name === tableName && p.id === id)),
      )
    } else {
      onChange(
        [...value, { table_name: tableName, id }],
        [...selectedParents, { table_name: tableName, id, name: nameForNew }],
      )
    }
  }

  function handleResultClick(result: EntityResult) {
    const name = entityDisplayName(result)
    if (!value.some(v => v.table_name === result.table_name && v.id === result.id)) {
      pushRecent({ table_name: result.table_name, id: result.id, name })
    }
    toggleEntry(result.table_name, result.id, name)
  }

  function handleRecentClick(ref: ParentRef) {
    toggleEntry(ref.table_name, ref.id, ref.name ?? ref.id)
  }

  function remove(tableName: string, id: string, e: React.MouseEvent) {
    e.stopPropagation()
    onChange(
      value.filter(v => !(v.table_name === tableName && v.id === id)),
      selectedParents.filter(p => !(p.table_name === tableName && p.id === id)),
    )
  }

  const showRecents = open && !query.trim() && recents.length > 0
  const showResults = open && query.trim() !== '' && results.length > 0

  return (
    <div ref={containerRef} className="flex flex-col gap-1.5">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
        {(showRecents || showResults) && (
          <div className="absolute z-50 top-full mt-1 w-full rounded-md border border-border bg-card shadow-xl max-h-48 overflow-y-auto">
            <div className="p-1">
              {showRecents && (
                <>
                  <div className="px-2 py-1 text-xs text-muted-foreground font-medium">Recent</div>
                  {recents.map(ref => {
                    const isSelec = value.some(v => v.table_name === ref.table_name && v.id === ref.id)
                    return (
                      <button
                        key={`${ref.table_name}:${ref.id}`}
                        type="button"
                        onClick={() => handleRecentClick(ref)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors',
                          isSelec && 'text-primary',
                        )}
                      >
                        <div className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border border-border shrink-0',
                          isSelec && 'bg-primary border-primary',
                        )}>
                          {isSelec && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <span className="flex-1 truncate">{ref.name ?? ref.id}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{ref.table_name}</span>
                      </button>
                    )
                  })}
                </>
              )}
              {showResults && results.map(result => {
                const isSelec = value.some(v => v.table_name === result.table_name && v.id === result.id)
                return (
                  <button
                    key={`${result.table_name}:${result.id}`}
                    type="button"
                    onClick={() => handleResultClick(result)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors',
                      isSelec && 'text-primary',
                    )}
                  >
                    <div className={cn(
                      'flex h-4 w-4 items-center justify-center rounded border border-border shrink-0',
                      isSelec && 'bg-primary border-primary',
                    )}>
                      {isSelec && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className="flex-1 truncate">{entityDisplayName(result)}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{result.table_name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {selectedParents.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedParents.map(p => (
            <Badge key={`${p.table_name}:${p.id}`} variant="secondary" className="gap-1 pr-1">
              {p.name ?? p.id}
              <button
                type="button"
                aria-label={`Remove ${p.name ?? p.id}`}
                onClick={(e) => remove(p.table_name, p.id, e)}
                className="rounded hover:bg-border ml-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
