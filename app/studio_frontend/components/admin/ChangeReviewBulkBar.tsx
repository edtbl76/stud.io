'use client'

import type { BulkAction } from '@/lib/useChangeReviewBulk'

interface ChangeReviewBulkBarProps {
  selectedCount: number
  bulkAction: BulkAction | null
  onBulkApprove: () => void
  onBulkReject: () => void
  onConfirm: () => void
  onCancelBulk: () => void
}

export function ChangeReviewBulkBar({
  selectedCount, bulkAction, onBulkApprove, onBulkReject, onConfirm, onCancelBulk,
}: Readonly<ChangeReviewBulkBarProps>) {
  return (
    <>
      <div className="flex items-center gap-3 py-2 text-sm">
        <span className="text-muted-foreground">{selectedCount} selected</span>
        <button type="button" onClick={onBulkApprove} className="border rounded px-2 py-1 text-xs">
          Bulk Approve
        </button>
        <button type="button" onClick={onBulkReject} className="border rounded px-2 py-1 text-xs">
          Bulk Reject (Undo)
        </button>
      </div>

      {bulkAction && (
        <div className="mb-3 p-3 border border-border rounded text-sm flex items-center gap-3">
          <span>
            {bulkAction === 'approve'
              ? `Approve ${selectedCount} pending changes?`
              : `Reject (undo) ${selectedCount} pending changes?`}
          </span>
          <button type="button" onClick={onConfirm} className="border rounded px-2 py-1 text-xs">
            Confirm
          </button>
          <button type="button" onClick={onCancelBulk} className="text-xs text-muted-foreground">
            Cancel
          </button>
        </div>
      )}
    </>
  )
}
