'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SCANNER_TABLE_OPTIONS } from '@/lib/types'

interface InitialData {
  name: string
  vendor: string
  version: string
  format: string
}

interface CreateRecordModalProps {
  initialData: InitialData
  onSubmit: (table: string, data: Record<string, string>) => Promise<void>
  onClose: () => void
}

type TableValue = typeof SCANNER_TABLE_OPTIONS[number]['value']

export function CreateRecordModal({ initialData, onSubmit, onClose }: Readonly<CreateRecordModalProps>) {
  const [table, setTable] = React.useState<TableValue>('effects')
  const [name, setName] = React.useState(initialData.name)
  const [vendor, setVendor] = React.useState(initialData.vendor)
  const [version, setVersion] = React.useState(initialData.version)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit(table, { name, vendor, version, format: initialData.format })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create record')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="create-record-modal">
        <DialogHeader>
          <DialogTitle>Create Catalog Record</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="record-table">Target table</Label>
            <select
              id="record-table"
              value={table}
              onChange={(e) => setTable(e.target.value as TableValue)}
              className="w-full rounded border border-border bg-muted px-3 py-2 text-sm text-foreground"
              data-testid="create-record-table-select"
            >
              {SCANNER_TABLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="record-name">Name</Label>
            <Input
              id="record-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-testid="create-record-name-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="record-vendor">Vendor</Label>
            <Input
              id="record-vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              data-testid="create-record-vendor-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="record-version">Version</Label>
            <Input
              id="record-version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              data-testid="create-record-version-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Format</Label>
            <p className="text-sm text-muted-foreground font-mono">{initialData.format}</p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border px-3 py-1.5 text-sm"
              data-testid="create-record-cancel-button"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              data-testid="create-record-submit-button"
            >
              {submitting ? 'Creating...' : 'Create Record'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
