'use client'

import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { WorkbenchRow as WorkbenchRowComponent } from './WorkbenchRow'
import type { WorkbenchRow, OrphanedRecord, NeedsReviewSubState } from '@/lib/types'

const SKELETON_COUNT = 8
const WORKBENCH_HEIGHT = '600px'

function OrphanedSection({ orphaned, onOrphanFindLink }: Readonly<{ orphaned: OrphanedRecord[]; onOrphanFindLink?: (r: OrphanedRecord) => void }>) {
  if (orphaned.length === 0) return null
  return (
    <div className="mt-6">
      <h3 className="px-3 py-2 text-sm font-semibold text-muted-foreground">Orphaned Catalog Records</h3>
      {orphaned.map((o) => (
        <div key={o.catalog_record_id} className="px-3 py-2 text-sm flex gap-3 items-center">
          <span>{o.name}</span>
          {o.vendor && <span className="text-muted-foreground">{o.vendor}</span>}
          {o.version && <span className="text-muted-foreground">{o.version}</span>}
          {onOrphanFindLink && (
            <button type="button" onClick={() => onOrphanFindLink(o)}>Find Link</button>
          )}
        </div>
      ))}
    </div>
  )
}

interface RowActionHandlers {
  onReject?: (row: WorkbenchRow) => void
  onFindLink?: (row: WorkbenchRow) => void
  onCreateRecord?: (row: WorkbenchRow) => void
  onExclude?: (row: WorkbenchRow) => void
  onResolveCollision?: (row: WorkbenchRow) => void
}

// Bind each row-taking handler to a specific row, producing the WorkbenchRow's `() => void` props.
function bindRowActions(row: WorkbenchRow, h: RowActionHandlers) {
  const bind = (fn?: (r: WorkbenchRow) => void) => (fn ? () => fn(row) : undefined)
  return {
    onReject: bind(h.onReject),
    onFindLink: bind(h.onFindLink),
    onCreateRecord: bind(h.onCreateRecord),
    onExclude: bind(h.onExclude),
    onResolveCollision: bind(h.onResolveCollision),
  }
}

interface WorkbenchTableProps extends RowActionHandlers {
  rows: WorkbenchRow[]
  orphaned: OrphanedRecord[]
  isLoading: boolean
  selectedIds: Set<string>
  rowSubStates: Map<string, NeedsReviewSubState>
  onToggleSelect: (id: string) => void
  onShiftSelect: (id: string) => void
  onRowClick: (row: WorkbenchRow) => void
  onSelectAll?: () => void
  onOrphanFindLink?: (record: OrphanedRecord) => void
}

export function WorkbenchTable({
  rows, orphaned, isLoading, selectedIds, rowSubStates,
  onToggleSelect, onShiftSelect, onRowClick,
  onSelectAll, onOrphanFindLink, onReject, onFindLink, onCreateRecord, onExclude, onResolveCollision,
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
      <div className="flex items-center px-3 py-1 border-b border-border">
        <input
          type="checkbox"
          aria-label="Select all"
          checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.result_id))}
          onChange={onSelectAll}
        />
      </div>
      <div ref={parentRef} className="overflow-y-auto" style={{ height: WORKBENCH_HEIGHT }}>
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
                  subState={rowSubStates.get(row.result_id)}
                  onToggleSelect={onToggleSelect}
                  onShiftSelect={onShiftSelect}
                  onRowClick={onRowClick}
                  {...bindRowActions(row, { onReject, onFindLink, onCreateRecord, onExclude, onResolveCollision })}
                />
              </div>
            )
          })}
        </div>
      </div>

      <OrphanedSection orphaned={orphaned} onOrphanFindLink={onOrphanFindLink} />
    </div>
  )
}
