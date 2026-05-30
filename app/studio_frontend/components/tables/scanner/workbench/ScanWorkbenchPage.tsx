'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useWorkbench } from '@/lib/useWorkbench'
import { WorkbenchFilterBar } from './WorkbenchFilterBar'
import { WorkbenchBulkBar } from './WorkbenchBulkBar'
import { WorkbenchTable } from './WorkbenchTable'
import { SingleResolutionModal } from '../modals/SingleResolutionModal'
import { CollisionModal } from '../modals/CollisionModal'
import { FindLinkModal } from '../modals/FindLinkModal'
import { CreateRecordModal } from '../modals/CreateRecordModal'
import type { OrphanedRecord, WorkbenchRow } from '@/lib/types'

const HARD_RESET_CONFIRMATION = 'RESET ALL SCANNER DATA'

interface HardResetDialogProps {
  isOpen: boolean
  confirmText: string
  isSubmitting: boolean
  onConfirmTextChange: (text: string) => void
  onConfirm: () => void
  onCancel: () => void
}

function HardResetDialog({ isOpen, confirmText, isSubmitting, onConfirmTextChange, onConfirm, onCancel }: Readonly<HardResetDialogProps>) {
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
          <button type="button" onClick={onConfirm} disabled={confirmText !== HARD_RESET_CONFIRMATION || isSubmitting}>
            Confirm
          </button>
        </div>
      </div>
    </dialog>
  )
}

type ActiveModal =
  | { type: 'single-resolution'; row: WorkbenchRow }
  | { type: 'collision'; rowA: WorkbenchRow; rowB: WorkbenchRow }
  | { type: 'find-link-unlinked'; sourceId: string }
  | { type: 'find-link-orphaned'; sourceId: string }
  | { type: 'create-record'; row: WorkbenchRow }
  | null

export function ScanWorkbenchPage() {
  const {
    rows, orphaned, isLoading, clientFilters, setClientFilter,
    selectedIds, toggleSelect, shiftSelect, selectAll, clearSelection, invalidate,
    rowSubStates,
  } = useWorkbench()

  const [hardResetOpen, setHardResetOpen] = useState(false)
  const [hardResetText, setHardResetText] = useState('')
  const [hardResetSubmitting, setHardResetSubmitting] = useState(false)
  const [bulkResolveQueue, setBulkResolveQueue] = useState<WorkbenchRow[]>([])
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)

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
    if (hardResetSubmitting) return
    setHardResetSubmitting(true)
    try {
      await api.scanner.hardReset(hardResetText)
      toast.success('Hard reset complete')
      setHardResetOpen(false)
      setHardResetText('')
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hard reset failed. Please try again.')
    } finally {
      setHardResetSubmitting(false)
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

  // Step 18: single-row reject
  async function handleReject(row: WorkbenchRow) {
    try {
      await api.scanner.rejectMatch(row.result_id)
      toast.success('Match rejected')
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed. Please try again.')
    }
  }

  // Step 19: Find Link
  function handleFindLink(row: WorkbenchRow) {
    setActiveModal({ type: 'find-link-unlinked', sourceId: row.result_id })
  }

  function handleOrphanFindLink(record: OrphanedRecord) {
    setActiveModal({ type: 'find-link-orphaned', sourceId: record.catalog_record_id })
  }

  // Step 20: Create Record
  function handleCreateRecord(row: WorkbenchRow) {
    setActiveModal({ type: 'create-record', row })
  }

  // Step 21: single-row exclude
  async function handleExclude(row: WorkbenchRow) {
    try {
      await api.scanner.exclude(row.disk_vendor, row.disk_name, row.disk_format)
      toast.success('Entry excluded')
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Exclude failed. Please try again.')
    }
  }

  // Step 22: resolve collision (replace stub)
  function handleResolveCollision() {
    const pair = selectedRows.filter((r) => r.catalog_record_id !== null)
    if (pair.length === 2) {
      setActiveModal({ type: 'collision', rowA: pair[0], rowB: pair[1] })
    }
  }

  // Step 23: bulk reject (replace stub)
  async function handleBulkReject() {
    const queue = selectedRows.filter((r) => r.bucket === 'needs_review' || r.bucket === 'known')
    let completed = 0
    try {
      for (const row of queue) {
        await api.scanner.rejectMatch(row.result_id)
        completed++
      }
      toast.success(`${completed} matches rejected`)
    } catch (err) {
      toast.error(err instanceof Error ? `${completed} of ${queue.length} rejected — stopped on error` : 'Bulk reject failed.')
    } finally {
      clearSelection()
      invalidate()
    }
  }

  async function handleBulkUpdate() {
    const qualifying = selectedRows.filter((r) => rowSubStates.get(r.result_id) === 'mismatch')
    try {
      const result = await api.scanner.bulkUpdate(qualifying.map((r) => r.result_id))
      toast.success(`${result.updated} record(s) updated`)
      clearSelection()
      invalidate()
    } catch {
      toast.error('Bulk update failed. Please try again.')
    }
  }

  async function handleBulkExclude() {
    try {
      await Promise.all(
        selectedRows.map((r) => api.scanner.exclude(r.disk_vendor, r.disk_name, r.disk_format))
      )
      clearSelection()
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk exclude failed. Please try again.')
    }
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
          rowSubStates={rowSubStates}
          onResolveCollision={handleResolveCollision}
          onBulkResolve={handleBulkResolve}
          onBulkUpdate={handleBulkUpdate}
          onBulkReject={handleBulkReject}
          onBulkExclude={handleBulkExclude}
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
        onSelectAll={selectAll}
        onOrphanFindLink={handleOrphanFindLink}
        onReject={handleReject}
        onFindLink={handleFindLink}
        onCreateRecord={handleCreateRecord}
        onExclude={handleExclude}
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

      {activeModal?.type === 'collision' && (
        <CollisionModal
          rowA={activeModal.rowA}
          rowB={activeModal.rowB}
          onClose={() => setActiveModal(null)}
          onSaved={() => { setActiveModal(null); invalidate() }}
          onFireRuleToasts={() => undefined}
        />
      )}

      {(activeModal?.type === 'find-link-unlinked' || activeModal?.type === 'find-link-orphaned') && (
        <FindLinkModal
          mode={activeModal.type === 'find-link-unlinked' ? 'unlinked-to-orphaned' : 'orphaned-to-unlinked'}
          sourceId={activeModal.sourceId}
          onClose={() => setActiveModal(null)}
          onLinked={() => { setActiveModal(null); invalidate() }}
        />
      )}

      {activeModal?.type === 'create-record' && (
        <CreateRecordModal
          row={activeModal.row}
          onClose={() => setActiveModal(null)}
          onSaved={() => { setActiveModal(null); invalidate() }}
        />
      )}

      <HardResetDialog
        isOpen={hardResetOpen}
        confirmText={hardResetText}
        isSubmitting={hardResetSubmitting}
        onConfirmTextChange={setHardResetText}
        onConfirm={handleHardReset}
        onCancel={handleHardResetCancel}
      />
    </div>
  )
}
