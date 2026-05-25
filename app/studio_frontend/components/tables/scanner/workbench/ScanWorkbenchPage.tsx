'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useWorkbench } from '@/lib/useWorkbench'
import { WorkbenchFilterBar } from './WorkbenchFilterBar'
import { WorkbenchBulkBar } from './WorkbenchBulkBar'
import { WorkbenchTable } from './WorkbenchTable'
import { SingleResolutionModal } from '../modals/SingleResolutionModal'
import type { WorkbenchRow } from '@/lib/types'

const HARD_RESET_CONFIRMATION = 'RESET ALL SCANNER DATA'

interface HardResetDialogProps {
  isOpen: boolean
  confirmText: string
  onConfirmTextChange: (text: string) => void
  onConfirm: () => void
  onCancel: () => void
}

function HardResetDialog({ isOpen, confirmText, onConfirmTextChange, onConfirm, onCancel }: Readonly<HardResetDialogProps>) {
  if (!isOpen) return null
  return (
    <dialog open className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-base font-semibold mb-4">Hard Reset</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Type <strong>{HARD_RESET_CONFIRMATION}</strong> to confirm.
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => onConfirmTextChange(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm mb-4"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={onConfirm} disabled={confirmText !== HARD_RESET_CONFIRMATION}>
            Confirm
          </button>
        </div>
      </div>
    </dialog>
  )
}

export function ScanWorkbenchPage() {
  const {
    rows, orphaned, isLoading, clientFilters, setClientFilter,
    selectedIds, toggleSelect, shiftSelect, clearSelection, invalidate,
    rowSubStates,
  } = useWorkbench()

  const [hardResetOpen, setHardResetOpen] = useState(false)
  const [hardResetText, setHardResetText] = useState('')
  const [bulkResolveQueue, setBulkResolveQueue] = useState<WorkbenchRow[]>([])

  const selectedRows = rows.filter((r) => selectedIds.has(r.result_id))

  async function handleSoftReset() {
    try {
      await api.scanner.softReset()
      toast.success('Soft reset complete')
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Soft reset failed. Please try again.')
    }
  }

  async function handleHardReset() {
    try {
      await api.scanner.hardReset(hardResetText)
      toast.success('Hard reset complete')
      setHardResetOpen(false)
      setHardResetText('')
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hard reset failed. Please try again.')
    }
  }

  function handleHardResetCancel() {
    setHardResetOpen(false)
    setHardResetText('')
  }

  function handleBulkResolve() {
    const queue = selectedRows.filter((r) => r.bucket === 'needs_review')
    setBulkResolveQueue(queue)
  }

  function handleModalSaved() {
    invalidate()
    setBulkResolveQueue((prev) => prev.slice(1))
  }

  const currentModalRow = bulkResolveQueue[0] ?? null

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Scan Workbench</h1>
        <div className="flex gap-2">
          <button type="button" onClick={handleSoftReset} className="text-sm border rounded px-3 py-1">
            Soft Reset
          </button>
          <button type="button" onClick={() => setHardResetOpen(true)} className="text-sm border rounded px-3 py-1">
            Hard Reset
          </button>
        </div>
      </div>

      <WorkbenchFilterBar filters={clientFilters} onFiltersChange={setClientFilter} />

      {selectedIds.size > 0 && (
        <WorkbenchBulkBar
          selectedRows={selectedRows}
          onResolveCollision={() => undefined}
          onBulkResolve={handleBulkResolve}
          onBulkReject={() => undefined}
          onBulkExclude={() => undefined}
          onClearSelection={clearSelection}
        />
      )}

      <WorkbenchTable
        rows={rows}
        orphaned={orphaned}
        isLoading={isLoading}
        selectedIds={selectedIds}
        rowSubStates={rowSubStates}
        onToggleSelect={toggleSelect}
        onShiftSelect={shiftSelect}
        onRowClick={() => undefined}
      />

      {currentModalRow && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 w-full max-w-lg shadow-xl">
            <SingleResolutionModal
              row={currentModalRow}
              onClose={() => setBulkResolveQueue([])}
              onSaved={handleModalSaved}
              onFireRuleToasts={() => undefined}
            />
          </div>
        </div>
      )}

      <HardResetDialog
        isOpen={hardResetOpen}
        confirmText={hardResetText}
        onConfirmTextChange={setHardResetText}
        onConfirm={handleHardReset}
        onCancel={handleHardResetCancel}
      />
    </div>
  )
}
