'use client'

import { useWorkbench } from '@/lib/useWorkbench'
import { useScanWorkbenchActions } from '@/lib/useScanWorkbenchActions'
import { WorkbenchFilterBar } from './WorkbenchFilterBar'
import { WorkbenchBulkBar } from './WorkbenchBulkBar'
import { WorkbenchTable } from './WorkbenchTable'
import { SingleResolutionModal } from '../modals/SingleResolutionModal'
import { CollisionModal } from '../modals/CollisionModal'
import { FindLinkModal } from '../modals/FindLinkModal'
import { CreateRecordModal } from '../modals/CreateRecordModal'

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

interface WorkbenchModalsProps {
  activeModal: ReturnType<typeof useScanWorkbenchActions>['activeModal']
  setActiveModal: ReturnType<typeof useScanWorkbenchActions>['setActiveModal']
  currentModalRow: ReturnType<typeof useScanWorkbenchActions>['currentModalRow']
  setBulkResolveQueue: ReturnType<typeof useScanWorkbenchActions>['setBulkResolveQueue']
  handleModalSaved: () => void
  invalidate: () => void
}

type RenderModalProps = {
  modal: WorkbenchModalsProps['activeModal']
  onClose: () => void
  onCloseAndInvalidate: () => void
}

function renderActiveModal({ modal, onClose, onCloseAndInvalidate }: RenderModalProps) {
  if (!modal) return null
  if (modal.type === 'collision') {
    return <CollisionModal rowA={modal.rowA} rowB={modal.rowB}
      onClose={onClose} onSaved={onCloseAndInvalidate} onFireRuleToasts={() => undefined} />
  }
  if (modal.type === 'find-link-unlinked' || modal.type === 'find-link-orphaned') {
    const mode = modal.type === 'find-link-unlinked' ? 'unlinked-to-orphaned' : 'orphaned-to-unlinked'
    return <FindLinkModal mode={mode} sourceId={modal.sourceId} onClose={onClose} onLinked={onCloseAndInvalidate} />
  }
  if (modal.type === 'create-record') {
    return <CreateRecordModal row={modal.row} onClose={onClose} onSaved={onCloseAndInvalidate} />
  }
  return null
}

function WorkbenchModals({ activeModal, setActiveModal, currentModalRow, setBulkResolveQueue, handleModalSaved, invalidate }: Readonly<WorkbenchModalsProps>) {
  const onClose = () => setActiveModal(null)
  const onCloseAndInvalidate = () => { setActiveModal(null); invalidate() }
  return (
    <>
      {currentModalRow && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 w-full max-w-lg shadow-xl">
            <SingleResolutionModal row={currentModalRow}
              onClose={() => setBulkResolveQueue([])} onSaved={handleModalSaved} onFireRuleToasts={() => undefined} />
          </div>
        </div>
      )}
      {renderActiveModal({ modal: activeModal, onClose, onCloseAndInvalidate })}
    </>
  )
}

export function ScanWorkbenchPage() {
  const {
    rows, orphaned, isLoading, clientFilters, setClientFilter, setServerBucket,
    selectedIds, toggleSelect, shiftSelect, selectAll, clearSelection, invalidate,
    rowSubStates,
  } = useWorkbench()

  function handleFiltersChange(patch: Partial<typeof clientFilters>) {
    if ('bucket' in patch) {
      setServerBucket(patch.bucket || undefined)
    }
    setClientFilter(patch)
  }

  const actions = useScanWorkbenchActions({ rows, selectedIds, rowSubStates, invalidate, clearSelection })
  const { selectedRows, currentModalRow, activeModal, setActiveModal } = actions

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Scan Workbench</h1>
        <div className="flex gap-2">
          <button type="button" onClick={actions.handleSoftReset} className="text-sm border rounded px-3 py-1">
            Soft Reset
          </button>
          <button type="button" onClick={() => actions.setHardResetOpen(true)} className="text-sm border rounded px-3 py-1">
            Hard Reset
          </button>
        </div>
      </div>

      <WorkbenchFilterBar filters={clientFilters} onFiltersChange={handleFiltersChange} />

      {selectedIds.size > 0 && (
        <WorkbenchBulkBar
          selectedRows={selectedRows}
          rowSubStates={rowSubStates}
          onResolveCollision={actions.handleResolveCollision}
          onBulkResolve={actions.handleBulkResolve}
          onBulkUpdate={actions.handleBulkUpdate}
          onBulkReject={actions.handleBulkReject}
          onBulkExclude={actions.handleBulkExclude}
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
        onOrphanFindLink={actions.handleOrphanFindLink}
        onReject={actions.handleReject}
        onFindLink={actions.handleFindLink}
        onCreateRecord={actions.handleCreateRecord}
        onExclude={actions.handleExclude}
      />

      <WorkbenchModals
        activeModal={activeModal}
        setActiveModal={setActiveModal}
        currentModalRow={currentModalRow}
        setBulkResolveQueue={actions.setBulkResolveQueue}
        handleModalSaved={actions.handleModalSaved}
        invalidate={invalidate}
      />

      <HardResetDialog
        isOpen={actions.hardResetOpen}
        confirmText={actions.hardResetText}
        isSubmitting={actions.hardResetSubmitting}
        onConfirmTextChange={actions.setHardResetText}
        onConfirm={actions.handleHardReset}
        onCancel={actions.handleHardResetCancel}
      />
    </div>
  )
}
