'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface EntityResult { id: string; name: string; brand_name: string | null; table_name: string }

interface EntitySearchInputProps {
  id: string
  label: string
  table: string
  value: string
  onChange: (id: string) => void
  placeholder?: string
}

export function EntitySearchInput({ id, label, table, value, onChange, placeholder }: Readonly<EntitySearchInputProps>) {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<EntityResult[]>([])
  const [selectedName, setSelectedName] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    let active = true
    const t = setTimeout(async () => {
      try {
        const data = await api.searchEntities(query)
        if (active) setResults(data.results.filter(r => r.table_name === table))
      } catch {
        if (active) setResults([])
      }
    }, 300)
    return () => { active = false; clearTimeout(t) }
  }, [query, table])

  function handleSelect(r: EntityResult) {
    onChange(r.id)
    setSelectedName(r.brand_name ? `${r.brand_name} ${r.name}` : r.name)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function handleClear() {
    onChange('')
    setSelectedName(null)
    setQuery('')
    setResults([])
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {selectedName ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm text-foreground bg-muted/40 rounded px-3 py-2 truncate">{selectedName}</span>
          <button onClick={handleClear} className="text-xs text-muted-foreground hover:text-foreground shrink-0">Clear</button>
        </div>
      ) : (
        <div className="relative">
          <Input
            id={id}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={placeholder ?? `Search ${label.toLowerCase()}…`}
          />
          {open && results.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded shadow-lg max-h-48 overflow-y-auto">
              {results.map(r => (
                <button
                  key={r.id}
                  onMouseDown={() => handleSelect(r)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 flex flex-col"
                >
                  <span className="font-medium text-foreground">{r.name}</span>
                  {r.brand_name && <span className="text-xs text-muted-foreground">{r.brand_name}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
