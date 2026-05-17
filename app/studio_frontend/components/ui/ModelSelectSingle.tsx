'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { api } from '@/lib/api'
import type { FilterState } from '@/lib/filterOperators'
import type { Model } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

interface ModelSelectSingleProps {
  readonly id?: string
  readonly value: string
  readonly displayName: string
  readonly onChange: (id: string, name: string) => void
  readonly typeFilter?: string
  readonly placeholder?: string
}

function buildFilters(query: string, typeFilter?: string): FilterState {
  const filters: FilterState = { name: { value: query, operator: 'contains' } }
  if (typeFilter) filters['model_type'] = { value: typeFilter, operator: 'contains' }
  return filters
}

function useModelSearch(query: string, open: boolean, typeFilter?: string) {
  const [results, setResults] = React.useState<Model[]>([])

  React.useEffect(() => {
    if (!open) return
    const timer = setTimeout(async () => {
      if (!query.trim()) { setResults([]); return }
      try {
        const data = await api.listPaged<Model>('/studio/catalog/models', {
          limit: 50,
          filters: buildFilters(query, typeFilter),
        })
        setResults(data.items)
      } catch {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, open, typeFilter])

  return results
}

function useOutsideClick(ref: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [ref, onClose])
}

export function ModelSelectSingle({
  id,
  value,
  displayName,
  onChange,
  typeFilter,
  placeholder = 'Search models...',
}: ModelSelectSingleProps) {
  const [query, setQuery] = React.useState(displayName)
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => { setQuery(displayName) }, [displayName])

  const results = useModelSearch(query, open, typeFilter)
  const close = React.useCallback(() => setOpen(false), [])
  useOutsideClick(containerRef, close)

  function select(model: Model) {
    onChange(model.model_id, model.full_model_name)
    setQuery(model.full_model_name)
    setOpen(false)
  }

  function clear() {
    onChange('', '')
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <Input
          id={id}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
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
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-card shadow-xl max-h-48 overflow-y-auto">
          <div className="p-1">
            {results.map(model => (
              <button
                key={model.model_id}
                type="button"
                onClick={() => select(model)}
                className={cn(
                  'flex w-full items-center rounded px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors',
                  value === model.model_id && 'text-primary',
                )}
              >
                {model.full_model_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
