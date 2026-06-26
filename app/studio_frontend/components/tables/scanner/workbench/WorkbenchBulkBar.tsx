'use client'

import type { NeedsReviewSubState, WorkbenchRow } from '@/lib/types'

interface WorkbenchBulkBarProps {
  selectedRows: WorkbenchRow[]
  rowSubStates: Map<string, NeedsReviewSubState>
  onBulkResolve: () => void
  onBulkUpdate: () => void
  onBulkReject: () => void
  onBulkExclude: () => void
  onClearSelection: () => void
}

export function WorkbenchBulkBar({
  selectedRows,
  rowSubStates,
  onBulkResolve,
  onBulkUpdate,
  onBulkReject,
  onBulkExclude,
  onClearSelection,
}: Readonly<WorkbenchBulkBarProps>) {
  const showResolve = selectedRows.some((r) => r.bucket === 'needs_review')
  const showBulkUpdate = selectedRows.some((r) => rowSubStates.get(r.result_id) === 'mismatch')
  const showReject = selectedRows.some((r) => r.bucket === 'needs_review' || r.bucket === 'known')

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-muted-foreground">{selectedRows.length} selected</span>

      {showResolve && (
        <button type="button" onClick={onBulkResolve}>
          Resolve
        </button>
      )}

      {showBulkUpdate && (
        <button type="button" onClick={onBulkUpdate}>
          Bulk Update
        </button>
      )}

      {showReject && (
        <button type="button" onClick={onBulkReject}>
          Reject
        </button>
      )}

      <button type="button" onClick={onBulkExclude}>
        Exclude
      </button>

      <button type="button" onClick={onClearSelection}>
        Clear
      </button>
    </div>
  )
}
