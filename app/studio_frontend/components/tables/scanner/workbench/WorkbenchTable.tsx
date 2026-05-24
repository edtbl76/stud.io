'use client'

import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { WorkbenchRow as WorkbenchRowComponent } from './WorkbenchRow'
import type { WorkbenchRow, OrphanedRecord, NeedsReviewSubState } from '@/lib/types'

const SKELETON_COUNT = 8

interface WorkbenchTableProps {
  rows: WorkbenchRow[]
  orphaned: OrphanedRecord[]
  isLoading: boolean
  selectedIds: Set<string>
  rowSubStates: Map<string, NeedsReviewSubState>
  onToggleSelect: (id: string) => void
  onShiftSelect: (id: string) => void
  onRowClick: (row: WorkbenchRow) => void
}

export function WorkbenchTable({
  rows, orphaned, isLoading, selectedIds, rowSubStates,
  onToggleSelect, onShiftSelect, onRowClick,
}: Readonly<WorkbenchTableProps>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    getItemKey: (i) => rows[i].result_id,
  })

  if (isLoading) {
    return (
      <div>
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <div
            key={i}
            data-testid="workbench-skeleton-row"
            className="h-14 animate-pulse bg-muted rounded mx-3 my-1"
          />
        ))}
      </div>
    )
  }

  if (rows.length === 0 && orphaned.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">No results</div>
  }

  return (
    <div>
      <div ref={parentRef} className="overflow-y-auto" style={{ height: '600px' }}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vItem) => {
            const row = rows[vItem.index]
            return (
              <div
                key={vItem.key}
                style={{ position: 'absolute', top: vItem.start, width: '100%' }}
              >
                <WorkbenchRowComponent
                  row={row}
                  isSelected={selectedIds.has(row.result_id)}
                  onToggleSelect={onToggleSelect}
                  onShiftSelect={onShiftSelect}
                  onRowClick={onRowClick}
                />
              </div>
            )
          })}
        </div>
      </div>

      {orphaned.length > 0 && (
        <div className="mt-6">
          <h3 className="px-3 py-2 text-sm font-semibold text-muted-foreground">Orphaned Catalog Records</h3>
          {orphaned.map((o) => (
            <div key={o.catalog_record_id} className="px-3 py-2 text-sm flex gap-3">
              <span>{o.name}</span>
              {o.vendor && <span className="text-muted-foreground">{o.vendor}</span>}
              {o.version && <span className="text-muted-foreground">{o.version}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
