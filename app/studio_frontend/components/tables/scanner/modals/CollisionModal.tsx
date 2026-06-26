'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScannerModalContent } from './ScannerModalContent'
import type { ConfirmDecision, WorkbenchRow } from '@/lib/types'

interface CollisionModalProps {
  row: WorkbenchRow
  onClose: () => void
  onResolved: () => void
}

async function acknowledgeAll(copyIds: string[]): Promise<void> {
  // Keep all copies in one backend request; only report success if every copy applied.
  const decisions: ConfirmDecision[] = copyIds.map((id) => ({ result_id: id, action: 'acknowledge' }))
  const result = await api.scanner.confirm(decisions)
  if (result.errors.length > 0) throw new Error('Some copies could not be kept')
}

// Remove-straggler keeps one copy (acknowledge) and dismisses the rest. Acknowledge and dismiss
// are different endpoints — `dismiss` is not a confirm action — so this cannot be a single backend
// call without a new endpoint (out of U-18 scope; collision resolution reuses existing endpoints).
async function keepOneDismissRest(keeperId: string, copyIds: string[]): Promise<void> {
  await api.scanner.acknowledge(keeperId)
  for (const id of copyIds) {
    if (id !== keeperId) await api.scanner.dismiss(id)
  }
}

export function CollisionModal({ row, onClose, onResolved }: Readonly<CollisionModalProps>) {
  const [keeperId, setKeeperId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const info = row.collision
  if (!info) return null

  const copyIds = info.copies.map((c) => c.result_id)
  const rec = info.shared_catalog_record

  async function run(action: () => Promise<void>) {
    setIsSaving(true)
    setError(null)
    try {
      await action()
      onResolved()
    } catch {
      setError('Action failed. Please try again.')
      setIsSaving(false)
    }
  }

  const handleKeepAll = () => run(() => acknowledgeAll(copyIds))
  const handleExclude = () => run(() => api.scanner.exclude(row.disk_vendor, row.disk_name, row.disk_format))
  const handleRemoveStraggler = () => {
    if (keeperId) run(() => keepOneDismissRest(keeperId, copyIds))
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <ScannerModalContent>
        <DialogHeader>
          <DialogTitle>Resolve Collision — {rec.name}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4">
          <p className="text-sm text-muted-foreground mb-3">
            {rec.vendor} · {rec.version} · {rec.table}
          </p>
          <ul className="flex flex-col gap-2">
            {info.copies.map((c) => (
              <li key={c.result_id} className="flex items-center gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="keeper"
                    value={c.result_id}
                    data-testid={`collision-copy-${c.result_id}`}
                    checked={keeperId === c.result_id}
                    onChange={() => setKeeperId(c.result_id)}
                  />
                  <span className="font-mono">{c.path}</span>
                </label>
                <span className="text-muted-foreground">{c.version} · {c.format}</span>
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <button type="button" data-testid="collision-cancel" onClick={onClose}>Cancel</button>
          <button type="button" data-testid="collision-exclude" onClick={handleExclude} disabled={isSaving}>Exclude</button>
          <button
            type="button"
            data-testid="collision-remove-straggler"
            onClick={handleRemoveStraggler}
            disabled={!keeperId || isSaving}
          >
            Remove straggler
          </button>
          <button type="button" data-testid="collision-keep-all" onClick={handleKeepAll} disabled={isSaving}>Keep all</button>
        </DialogFooter>
      </ScannerModalContent>
    </Dialog>
  )
}
