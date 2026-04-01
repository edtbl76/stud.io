'use client'

import * as React from 'react'
import { Table, Header, flexRender } from '@tanstack/react-table'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FilterCell } from '@/components/FilterCell'
import type { FilterState, FilterEntry } from '@/lib/filterOperators'

function renderFilterCell<TData>(
  header: Header<TData, unknown>,
  canFilter: boolean,
  manualFiltering: boolean | undefined,
  externalFilters: FilterState | undefined,
  onFilterEntryChange: ((colId: string, entry: FilterEntry | null) => void) | undefined,
): React.ReactNode {
  if (!canFilter) return null
  if (manualFiltering) {
    return (
      <FilterCell
        colId={header.column.id}
        entry={externalFilters?.[header.column.id]}
        filterOperators={header.column.columnDef.meta?.filterOperators}
        onEntryChange={onFilterEntryChange ?? (() => {})}
      />
    )
  }
  return (
    <input
      value={(header.column.getFilterValue() as string) ?? ''}
      onChange={(e) => header.column.setFilterValue(e.target.value || undefined)}
      placeholder="2+ chars…"
      className="w-full bg-transparent border border-border/60 rounded px-2 py-0.5 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/60 transition-colors"
    />
  )
}

interface DataTableHeaderProps<TData> {
  readonly table: Table<TData>
  readonly draggingId: string | null
  readonly onDragStart: (e: React.DragEvent, colId: string) => void
  readonly onDrop: (e: React.DragEvent, targetId: string) => void
  readonly manualFiltering?: boolean
  readonly externalFilters?: FilterState
  readonly onFilterEntryChange?: (colId: string, entry: FilterEntry | null) => void
}

export function DataTableHeader<TData>({
  table,
  draggingId,
  onDragStart,
  onDrop,
  manualFiltering,
  externalFilters,
  onFilterEntryChange,
}: DataTableHeaderProps<TData>) {
  return (
    <thead className="sticky top-0 z-10" style={{ backgroundColor: 'hsl(var(--card))' }}>
      {table.getHeaderGroups().map((headerGroup) => (
        <React.Fragment key={headerGroup.id}>
          <tr className="border-b border-border">
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, header.column.id)}
                className={cn(
                  'relative h-10 px-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide',
                  'whitespace-nowrap select-none',
                  draggingId === header.column.id && 'opacity-40',
                )}
                style={{ width: header.getSize() }}
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => onDragStart(e, header.column.id)}
                    className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/70 shrink-0 bg-transparent border-0 p-0"
                  >
                    <GripVertical className="h-3 w-3" />
                  </button>
                  <span className="flex-1 min-w-0">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </span>
                </div>
                {header.column.getCanResize() && (
                  <button
                    type="button"
                    aria-label="Resize column"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      header.getResizeHandler()(e)
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation()
                      header.getResizeHandler()(e)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      'absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none bg-transparent border-0 p-0',
                      'hover:bg-primary/40 transition-colors',
                      header.column.getIsResizing() && 'bg-primary/70',
                    )}
                  />
                )}
              </th>
            ))}
          </tr>
          <tr className="border-b border-border/60" style={{ backgroundColor: 'hsl(var(--muted) / 0.1)' }}>
            {headerGroup.headers.map((header) => {
              const canFilter = header.column.getCanFilter()
              return (
                <th
                  key={`filter-${header.id}`}
                  className="px-3 py-1.5"
                  style={{ width: header.getSize() }}
                >
                  {renderFilterCell(header, canFilter, manualFiltering, externalFilters, onFilterEntryChange)}
                </th>
              )
            })}
          </tr>
        </React.Fragment>
      ))}
    </thead>
  )
}
