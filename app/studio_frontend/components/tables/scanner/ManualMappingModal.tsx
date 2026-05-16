'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import type { CatalogSearchResult } from '@/lib/types'
import { SCANNER_TABLE_OPTIONS } from '@/lib/types'

interface ManualMappingModalProps {
  initialName: string
  onConfirm: (recordId: string, recordTable: string) => void
  onClose: () => void
}

export function ManualMappingModal({ initialName, onConfirm, onClose }: Readonly<ManualMappingModalProps>) {
  const [query, setQuery] = React.useState(initialName)
  const [table, setTable] = React.useState<string>('')
  const [results, setResults] = React.useState<CatalogSearchResult[]>([])
  const [searched, setSearched] = React.useState(false)
  const [selected, setSelected] = React.useState<CatalogSearchResult | null>(null)

  React.useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    const t = setTimeout(async () => {
      const res = await api.scanner.catalogSearch(query, table || undefined)
      setResults(res)
      setSearched(true)
    }, 300)
    return () => clearTimeout(t)
  }, [query, table])

  function handleConfirm() {
    if (selected) onConfirm(selected.record_id, selected.record_table)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="manual-mapping-modal">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
        <h2 className="text-base font-semibold text-foreground">Link to Catalog Record</h2>

        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null) }}
            placeholder="Search catalog…"
            className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm"
            data-testid="catalog-search-input"
            aria-label="Search catalog"
          />
          <select
            value={table}
            onChange={e => { setTable(e.target.value); setSelected(null) }}
            className="rounded border border-border bg-background px-2 py-2 text-sm"
            data-testid="catalog-table-filter"
            aria-label="Filter by table"
          >
            <option value="">All types</option>
            {SCANNER_TABLE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="min-h-[160px] border border-border rounded overflow-y-auto max-h-60">
          {searched && results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground" data-testid="catalog-search-empty">No matching catalog records found.</p>
          ) : (
            results.map(r => (
              <button
                key={r.record_id}
                onClick={() => setSelected(r)}
                className={`w-full text-left px-3 py-2 text-sm border-b border-border/50 last:border-0 hover:bg-muted/40 ${selected?.record_id === r.record_id ? 'bg-primary/10' : ''}`}
                data-testid={`catalog-search-result-${r.record_id}`}
              >
                <p className="font-medium text-foreground">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.vendor} · {r.record_table} {r.version ? `· ${r.version}` : ''}</p>
              </button>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-border px-4 py-2 text-sm hover:bg-muted"
            data-testid="manual-mapping-cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="manual-mapping-confirm"
          >
            Link Record
          </button>
        </div>
      </div>
    </div>
  )
}
