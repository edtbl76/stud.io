'use client'

import * as React from 'react'
import { Table, flexRender } from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DataTableHeaderProps<TData> {
  readonly table: Table<TData>
  readonly draggingId: string | null
  readonly onDragStart: (e: React.DragEvent, colId: string) => void
  readonly onDrop: (e: React.DragEvent, targetId: string) => void
}

function SortIcon({ sortDir }: { readonly sortDir: false | 'asc' | 'desc' }) {
  if (sortDir === 'asc') return <ChevronUp className="h-3 w-3" />
  if (sortDir === 'desc') return <ChevronDown className="h-3 w-3" />
  return <ChevronsUpDown className="h-3 w-3 opacity-40" />
}

export function DataTableHeader<TData>({
  table,
  draggingId,
  onDragStart,
  onDrop,
}: DataTableHeaderProps<TData>) {
  return (
    <thead className="sticky top-0 z-10" style={{ backgroundColor: 'hsl(var(--card))' }}>
      {table.getHeaderGroups().map((headerGroup) => (
        <React.Fragment key={headerGroup.id}>
          <tr className="border-b border-border">
            {headerGroup.headers.map((header) => {
              const sortable = header.column.getCanSort()
              const sortDir = header.column.getIsSorted()
              return (
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
                      className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/70 flex-shrink-0 bg-transparent border-0 p-0"
                    >
                      <GripVertical className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'flex items-center gap-1 flex-1 min-w-0 bg-transparent border-0 p-0 text-inherit',
                        sortable && 'cursor-pointer hover:text-foreground',
                      )}
                      onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {sortable && (
                        <span className="flex-shrink-0">
                          <SortIcon sortDir={sortDir} />
                        </span>
                      )}
                    </button>
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
              )
            })}
          </tr>
          <tr className="border-b border-border/60" style={{ backgroundColor: 'hsl(var(--muted) / 0.1)' }}>
            {headerGroup.headers.map((header) => (
              <th
                key={`filter-${header.id}`}
                className="px-3 py-1.5"
                style={{ width: header.getSize() }}
              >
                {header.column.getCanFilter() ? (
                  <input
                    value={(header.column.getFilterValue() as string) ?? ''}
                    onChange={(e) => header.column.setFilterValue(e.target.value || undefined)}
                    placeholder="Filter…"
                    className="w-full bg-transparent border border-border/60 rounded px-2 py-0.5 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/60 transition-colors"
                  />
                ) : null}
              </th>
            ))}
          </tr>
        </React.Fragment>
      ))}
    </thead>
  )
}
