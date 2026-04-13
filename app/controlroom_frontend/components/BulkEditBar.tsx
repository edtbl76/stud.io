'use client'

import * as React from 'react'
import { Loader2, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { ParentSelect, ParentId } from '@/components/ui/ParentSelect'
import type { ParentRef } from '@/lib/types'
import type { BulkEditField } from '@/lib/bulkEdit'

function canApplyField(field: BulkEditField, text: string, value: string[]): boolean {
  if (field.type === 'text') return text.trim().length > 0
  if (field.type === 'parentsearch') return true
  return value.length > 0
}

function buildParentsearchPayload(
  row: Record<string, unknown>,
  parentValue: ParentId[],
  unionParents: ParentRef[],
): Record<string, unknown> {
  const unionKeys = new Set(unionParents.map((p) => `${p.table_name}:${p.id}`))
  const finalKeys = new Set(parentValue.map((p) => `${p.table_name}:${p.id}`))
  const added = parentValue.filter((p) => !unionKeys.has(`${p.table_name}:${p.id}`))
  const removedKeys = new Set(
    unionParents.filter((p) => !finalKeys.has(`${p.table_name}:${p.id}`)).map((p) => `${p.table_name}:${p.id}`)
  )
  const rowParents = (row.parents as ParentRef[] | null) ?? []
  const kept = rowParents.filter((p) => !removedKeys.has(`${p.table_name}:${p.id}`))
  const keptKeys = new Set(kept.map((p) => `${p.table_name}:${p.id}`))
  const newAdded = added.filter((p) => !keptKeys.has(`${p.table_name}:${p.id}`))
  return {
    parent_ids: [
      ...kept.map((p) => ({ table_name: p.table_name, id: p.id })),
      ...newAdded.map((p) => ({ table_name: p.table_name, id: p.id })),
    ],
  }
}

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
  const [parentValue, setParentValue] = React.useState<ParentId[]>([])
  const [parentRefs, setParentRefs] = React.useState<ParentRef[]>([])
  const [unionParents, setUnionParents] = React.useState<ParentRef[]>([])
  const [applying, setApplying] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false)
  const [result, setResult] = React.useState<string | null>(null)

  const field = fields.find((f) => f.key === fieldKey) ?? null

  const selectedRowsRef = React.useRef(selectedRows)
  React.useLayoutEffect(() => { selectedRowsRef.current = selectedRows }, [selectedRows])

  React.useEffect(() => {
    setValue([])
    setText('')
    setResult(null)
    const currentField = fields.find((f) => f.key === fieldKey)
    if (currentField?.type === 'parentsearch') {
      const seen = new Set<string>()
      const union: ParentRef[] = []
      for (const row of selectedRowsRef.current) {
        for (const p of ((row.parents as ParentRef[] | null) ?? [])) {
          const key = `${p.table_name}:${p.id}`
          if (!seen.has(key)) { seen.add(key); union.push(p) }
        }
      }
      setUnionParents(union)
      setParentValue(union.map((p) => ({ table_name: p.table_name, id: p.id })))
      setParentRefs(union)
    } else {
      setUnionParents([])
      setParentValue([])
      setParentRefs([])
    }
  }, [fieldKey, fields])

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
        } else if (field.type === 'parentsearch') {
          payload = buildParentsearchPayload(row, parentValue, unionParents)
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

  async function handleBulkDelete() {
    setDeleting(true)
    setResult(null)
    const results = await Promise.allSettled(
      selectedRows.map((row) => api.delete(endpoint, getRowId(row)))
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    setDeleting(false)
    setConfirmBulkDelete(false)
    if (failed > 0) {
      setResult(`${results.length - failed} deleted, ${failed} failed`)
    } else {
      onApply()
    }
  }

  const canApply = field !== null && canApplyField(field, text, value)

  function renderFieldInput(f: BulkEditField) {
    if (f.type === 'text') {
      return (
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Set ${f.label}…`}
          className="h-8 text-xs"
        />
      )
    }
    if (f.type === 'parentsearch') {
      return (
        <ParentSelect
          value={parentValue}
          selectedParents={parentRefs}
          onChange={(ids, refs) => { setParentValue(ids); setParentRefs(refs) }}
        />
      )
    }
    return (
      <MultiSelect
        configSlug={f.configSlug!}
        value={value}
        onChange={setValue}
        singleSelect={f.type === 'singleselect'}
        placeholder={`Set ${f.label}…`}
        hideBadges
      />
    )
  }

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
        <div className={field.type === 'parentsearch' ? 'w-80' : 'w-56'}>
          {renderFieldInput(field)}
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

      <div className="ml-auto flex items-center gap-2 shrink-0">
        <div className="w-px h-4 bg-border" />
        {confirmBulkDelete ? (
          <>
            <span className="text-xs text-destructive">
              Delete {selectedRows.length} record{selectedRows.length === 1 ? '' : 's'}?
            </span>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs"
              disabled={deleting}
              onClick={handleBulkDelete}
            >
              {deleting && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              disabled={deleting}
              onClick={() => setConfirmBulkDelete(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-destructive hover:text-destructive"
            disabled={applying}
            onClick={() => setConfirmBulkDelete(true)}
            aria-label="Delete selected"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        )}
      </div>
    </div>
  )
}
