'use client'

import type { NeedsReviewSubState, WorkbenchRow as WorkbenchRowType } from '@/lib/types'
import { BucketTag } from './BucketTag'

interface WorkbenchRowProps {
  row: WorkbenchRowType
  isSelected: boolean
  subState?: NeedsReviewSubState
  onToggleSelect: (id: string) => void
  onShiftSelect: (id: string) => void
  onRowClick: (row: WorkbenchRowType) => void
  onReject?: () => void
  onFindLink?: () => void
  onCreateRecord?: () => void
  onExclude?: () => void
  onResolveCollision?: () => void
}

export function WorkbenchRow({ row, isSelected, subState, onToggleSelect, onShiftSelect, onRowClick, onReject, onFindLink, onCreateRecord, onExclude, onResolveCollision }: Readonly<WorkbenchRowProps>) {
  const { bucket, result_id, display_name, disk_name, display_vendor, disk_version, disk_format } = row

  function handleCheckboxClick(e: React.MouseEvent<HTMLInputElement>) {
    if (e.shiftKey) {
      onShiftSelect(result_id)
    } else {
      onToggleSelect(result_id)
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
      <input
        type="checkbox"
        checked={isSelected}
        onClick={handleCheckboxClick}
        onChange={() => undefined}
        className="shrink-0"
      />

      <button
        type="button"
        className="flex flex-1 items-center gap-3 text-left min-w-0"
        onClick={() => onRowClick(row)}
      >
        <span
          title={display_name === disk_name ? undefined : disk_name}
          className="flex-1 truncate text-sm"
        >
          {display_name}
        </span>
        {bucket === 'needs_review' && subState && (
          <BucketTag bucket={bucket} subState={subState} />
        )}
        {bucket === 'collision' && <BucketTag bucket={bucket} />}
        <span className="text-sm text-muted-foreground w-36 truncate">{display_vendor}</span>
        <span className="text-sm text-muted-foreground w-16 truncate">{disk_version}</span>
        <span className="text-sm text-muted-foreground w-12">{disk_format}</span>
      </button>

      <div className="flex items-center gap-1 ml-auto">
        {bucket === 'unlinked' && (
          <>
            <button type="button" onClick={onFindLink}>Find Link</button>
            <button type="button" onClick={onCreateRecord}>Create Record</button>
            <button type="button" onClick={onExclude}>Exclude</button>
          </>
        )}
        {bucket === 'orphaned' && (
          <button type="button" onClick={onFindLink}>Find Link</button>
        )}
        {(bucket === 'needs_review' || bucket === 'known') && (
          <button type="button" onClick={onReject}>Reject</button>
        )}
        {bucket === 'collision' && (
          <button type="button" onClick={onResolveCollision}>Resolve</button>
        )}
      </div>
    </div>
  )
}
