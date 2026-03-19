'use client'

import * as React from 'react'
import { Loader2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelect } from '@/components/ui/MultiSelect'
import type { BulkEditField } from '@/lib/bulkEdit'

interface BulkEditBarProps {
  selectedRows: Record<string, unknown>[]
  fields: BulkEditField[]
  endpoint: string
  getRowId: (row: Record<string, unknown>) => string
  onApply: () => void
  onClear: () => void
}

export function BulkEditBar({
  selectedRows,
  fields,
  endpoint,
  getRowId,
  onApply,
  onClear,
}: Readonly<BulkEditBarProps>) {
  const [fieldKey, setFieldKey] = React.useState('')
  const [value, setValue] = React.useState<string[]>([])
  const [text, setText] = React.useState('')
  const [applying, setApplying] = React.useState(false)
  const [result, setResult] = React.useState<string | null>(null)

  const field = fields.find((f) => f.key === fieldKey) ?? null

  React.useEffect(() => {
    setValue([])
    setText('')
    setResult(null)
  }, [fieldKey])

  async function handleApply() {
    if (!field) return
    setApplying(true)
    setResult(null)

    const results = await Promise.allSettled(
      selectedRows.map((row) => {
        const rowId = getRowId(row)
        let payload: Record<string, unknown>

        if (field.type === 'multiselect') {
          const existing = (row[field.key] as string[] | null) ?? []
          payload = { [field.key]: [...new Set([...existing, ...value])] }
        } else if (field.type === 'singleselect') {
          payload = { [field.key]: value[0] ?? null }
        } else {
          payload = { [field.key]: text.trim() || null }
        }

        return api.update(endpoint, rowId, payload)
      })
    )

    const failed = results.filter((r) => r.status === 'rejected').length
    setApplying(false)

    if (failed > 0) {
      setResult(`${results.length - failed} updated, ${failed} failed`)
    } else {
      onApply()
    }
  }

  const canApply =
    field !== null && (field.type === 'text' ? text.trim().length > 0 : value.length > 0)

  return (
    <div
      data-testid="bulk-edit-bar"
      className="flex items-center gap-3 px-4 py-2.5 bg-muted/40 border-b border-border text-sm flex-wrap"
    >
      {/* Selection count + clear */}
      <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
        <span className="font-medium text-foreground">{selectedRows.length}</span>{' '}
        selected
        <button
          type="button"
          onClick={onClear}
          className="ml-1 rounded hover:text-foreground transition-colors"
          aria-label="Clear selection"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="w-px h-4 bg-border shrink-0" />

      {/* Field picker */}
      <select
        value={fieldKey}
        onChange={(e) => setFieldKey(e.target.value)}
        className="h-8 rounded border border-border bg-muted px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Select field to bulk edit"
      >
        <option value="">Set field…</option>
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Value input */}
      {field && (
        <div className="w-56">
          {field.type === 'text' ? (
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Set ${field.label}…`}
              className="h-8 text-xs"
            />
          ) : (
            <MultiSelect
              configSlug={field.configSlug!}
              value={value}
              onChange={setValue}
              singleSelect={field.type === 'singleselect'}
              placeholder={`Set ${field.label}…`}
              hideBadges
            />
          )}
        </div>
      )}

      {/* Apply */}
      {field && (
        <Button
          size="sm"
          className="h-8 text-xs shrink-0"
          disabled={!canApply || applying}
          onClick={handleApply}
        >
          {applying && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          Apply to {selectedRows.length}
        </Button>
      )}

      {/* Result error */}
      {result && <span className="text-xs text-destructive">{result}</span>}
    </div>
  )
}
