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
import type { WorkbenchRow } from '@/lib/types'

interface CollisionModalProps {
  row: WorkbenchRow
  onClose: () => void
  onResolved: () => void
}

export function CollisionModal({ row, onClose, onResolved }: Readonly<CollisionModalProps>) { // skipcq: JS-0067 -- exported component, not a browser global
  const [keeperId, setKeeperId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const info = row.collision
  if (!info) return null

  const copyIds = info.copies.map((c) => c.result_id)
  const rec = info.shared_catalog_record

  async function run(action: () => Promise<unknown>) {
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

  const handleKeepAll = () => run(() => api.scanner.resolveCollision({ action: 'keep_all', copy_ids: copyIds }))
  const handleExclude = () => run(() => api.scanner.exclude(row.disk_vendor, row.disk_name, row.disk_format))
  const handleRemoveStraggler = () => {
    if (keeperId) {
      run(() => api.scanner.resolveCollision({ action: 'remove_straggler', copy_ids: copyIds, keeper_id: keeperId }))
    }
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
