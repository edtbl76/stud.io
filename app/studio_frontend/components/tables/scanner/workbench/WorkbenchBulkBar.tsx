'use client'

import type { WorkbenchRow } from '@/lib/types'

interface WorkbenchBulkBarProps {
  selectedRows: WorkbenchRow[]
  onResolveCollision: () => void
  onBulkResolve: () => void
  onBulkReject: () => void
  onBulkExclude: () => void
  onClearSelection: () => void
}

export function WorkbenchBulkBar({
  selectedRows,
  onResolveCollision,
  onBulkResolve,
  onBulkReject,
  onBulkExclude,
  onClearSelection,
}: Readonly<WorkbenchBulkBarProps>) {
  const showResolveCollision =
    selectedRows.length === 2 && selectedRows.every((r) => r.catalog_record_id !== null)
  const showResolve = selectedRows.some((r) => r.bucket === 'needs_review')
  const showReject = selectedRows.some((r) => r.bucket === 'needs_review' || r.bucket === 'known')

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-muted-foreground">{selectedRows.length} selected</span>

      {showResolveCollision && (
        <button type="button" onClick={onResolveCollision}>
          Resolve Collision
        </button>
      )}

      {showResolve && (
        <button type="button" onClick={onBulkResolve}>
          Resolve
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
