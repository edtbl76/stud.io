'use client'

import * as React from 'react'
import { X, Check } from 'lucide-react'
import { api } from '@/lib/api'
import type { Model, ModelRef } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface ModelSelectProps {
  value: string[]
  selectedModels: ModelRef[]
  onChange: (ids: string[], models: ModelRef[]) => void
  placeholder?: string
}

export function ModelSelect({
  value,
  selectedModels,
  onChange,
  placeholder = 'Search models...',
}: Readonly<ModelSelectProps>) {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<Model[]>([])
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const timer = setTimeout(async () => {
      if (!query.trim()) { setResults([]); return }
      try {
        const data = await api.listPaged<Model>('/models', { limit: 50, filters: { name: { value: query, operator: 'contains' } } })
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
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle(model: Model) {
    if (value.includes(model.model_id)) {
      onChange(
        value.filter(id => id !== model.model_id),
        selectedModels.filter(m => m.id !== model.model_id),
      )
    } else {
      onChange(
        [...value, model.model_id],
        [...selectedModels, { id: model.model_id, name: model.full_model_name }],
      )
    }
  }

  function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    onChange(value.filter(v => v !== id), selectedModels.filter(m => m.id !== id))
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-1.5">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
        {open && results.length > 0 && (
          <div className="absolute z-50 top-full mt-1 w-full rounded-md border border-border bg-card shadow-xl max-h-48 overflow-y-auto">
            <div className="p-1">
              {results.map(model => {
                const isSelected = value.includes(model.model_id)
                return (
                  <button
                    key={model.model_id}
                    type="button"
                    onClick={() => toggle(model)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors',
                      isSelected && 'text-primary',
                    )}
                  >
                    <div className={cn(
                      'flex h-4 w-4 items-center justify-center rounded border border-border flex-shrink-0',
                      isSelected && 'bg-primary border-primary',
                    )}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    {model.full_model_name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {selectedModels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedModels.map(m => (
            <Badge key={m.id} variant="secondary" className="gap-1 pr-1">
              {m.name}
              <button
                type="button"
                onClick={(e) => remove(m.id, e)}
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
