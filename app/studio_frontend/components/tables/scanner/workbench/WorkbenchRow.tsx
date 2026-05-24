'use client'

import type { WorkbenchRow as WorkbenchRowType } from '@/lib/types'

interface WorkbenchRowProps {
  row: WorkbenchRowType
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onShiftSelect: (id: string) => void
  onRowClick: (row: WorkbenchRowType) => void
}

export function WorkbenchRow({ row, isSelected, onToggleSelect, onShiftSelect, onRowClick }: Readonly<WorkbenchRowProps>) {
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
        <span className="text-sm text-muted-foreground w-36 truncate">{display_vendor}</span>
        <span className="text-sm text-muted-foreground w-16 truncate">{disk_version}</span>
        <span className="text-sm text-muted-foreground w-12">{disk_format}</span>
      </button>

      <div className="flex items-center gap-1 ml-auto">
        {(bucket === 'unlinked') && (
          <>
            <button type="button">Find Link</button>
            <button type="button">Create Record</button>
            <button type="button">Exclude</button>
          </>
        )}
        {(bucket === 'orphaned') && (
          <button type="button">Find Link</button>
        )}
        {(bucket === 'needs_review' || bucket === 'known') && (
          <button type="button">Reject</button>
        )}
      </div>
    </div>
  )
}
