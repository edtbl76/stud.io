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
import { HardResetDialog } from '../modals/HardResetDialog'

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
  if (modal.type === 'single-resolution') {
    return (
      <SingleResolutionModal row={modal.row} readOnly={modal.readOnly}
        onClose={onClose} onSaved={onCloseAndInvalidate} onFireRuleToasts={() => undefined} />
    )
  }
  if (modal.type === 'collision') {
    return <CollisionModal row={modal.row} onClose={onClose} onResolved={onCloseAndInvalidate} />
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
    rows, isLoading, clientFilters, setClientFilter, setServerBucket,
    selectedIds, toggleSelect, shiftSelect, toggleSelectAll, clearSelection, invalidate,
    rowSubStates,
  } = useWorkbench()

  function handleFiltersChange(patch: Partial<typeof clientFilters>) {
    if ('bucket' in patch) {
      const merged: Partial<typeof clientFilters> = patch.bucket === 'needs_review'
        ? patch
        : { ...patch, needs_review_substate: '' }
      setServerBucket(patch.bucket || undefined)
      setClientFilter(merged)
      return
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
          onBulkResolve={actions.handleBulkResolve}
          onBulkUpdate={actions.handleBulkUpdate}
          onBulkReject={actions.handleBulkReject}
          onBulkExclude={actions.handleBulkExclude}
          onClearSelection={clearSelection}
        />
      )}

      <WorkbenchTable
        rows={rows}
        isLoading={isLoading}
        selectedIds={selectedIds}
        rowSubStates={rowSubStates}
        onToggleSelect={toggleSelect}
        onShiftSelect={shiftSelect}
        onRowClick={actions.handleRowClick}
        onSelectAll={toggleSelectAll}
        onOrphanRowFindLink={actions.handleOrphanRowFindLink}
        onReject={actions.handleReject}
        onFindLink={actions.handleFindLink}
        onCreateRecord={actions.handleCreateRecord}
        onExclude={actions.handleExclude}
        onResolveCollision={actions.handleResolveCollision}
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
