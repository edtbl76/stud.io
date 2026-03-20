'use client'

import * as React from 'react'
import {
  ColumnDef,
  ColumnFiltersState,
  ColumnOrderState,
  ColumnResizeMode,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'
import { ChevronUp, ChevronDown, ChevronsUpDown, SlidersHorizontal, GripVertical } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const ROW_HEIGHT = 44

interface DataTableProps<TData, TValue> {
  readonly columns: ColumnDef<TData, TValue>[]
  readonly data: TData[]
  readonly onRowClick?: (row: TData) => void
  readonly isLoading?: boolean
  readonly selectedIds?: Set<string>
  readonly getRowId?: (row: TData) => string
  // Infinite scroll
  readonly hasNextPage?: boolean
  readonly fetchNextPage?: () => void
  readonly isFetchingNextPage?: boolean
  // Server-side sort (paginated tables)
  readonly manualSorting?: boolean
  readonly externalSorting?: SortingState
  readonly onExternalSortChange?: (sorting: SortingState) => void
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  isLoading = false,
  selectedIds,
  getRowId,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  manualSorting = false,
  externalSorting,
  onExternalSortChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnOrder, setColumnOrder] = React.useState<ColumnOrderState>([])
  const [showColMenu, setShowColMenu] = React.useState(false)
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: manualSorting ? (externalSorting ?? []) : sorting,
      columnFilters,
      columnVisibility,
      columnOrder,
    },
    manualSorting,
    onSortingChange: manualSorting
      ? (updater) => {
          const next = typeof updater === 'function' ? updater(externalSorting ?? []) : updater
          onExternalSortChange?.(next)
        }
      : setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode: 'onChange' as ColumnResizeMode,
    enableColumnResizing: true,
  })

  const rows = table.getRowModel().rows

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0 ? totalSize - virtualItems.at(-1)!.end : 0

  const lastVirtualItem = virtualItems.at(-1)
  React.useEffect(() => {
    if (!lastVirtualItem || !hasNextPage || isFetchingNextPage) return
    if (lastVirtualItem.index >= rows.length - 5) {
      fetchNextPage?.()
    }
  }, [lastVirtualItem?.index, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const activeFilterCount = columnFilters.length

  React.useEffect(() => {
    if (!showColMenu) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowColMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showColMenu])

  function handleDragStart(e: React.DragEvent, colId: string) {
    setDraggingId(colId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    if (!draggingId || draggingId === targetId) return
    const order = table.getAllLeafColumns().map((c) => c.id)
    const from = order.indexOf(draggingId)
    const to = order.indexOf(targetId)
    const next = [...order]
    next.splice(from, 1)
    next.splice(to, 0, draggingId)
    setColumnOrder(next)
    setDraggingId(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              onClick={() => setColumnFilters([])}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowColMenu((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground rounded border border-border hover:border-muted-foreground transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Columns
          </button>
          {showColMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded border border-border bg-card shadow-lg py-1">
              {table.getAllLeafColumns().filter((col) => col.id !== '__select__').map((col) => {
                const header = col.columnDef.header
                const label = typeof header === 'string' ? header : col.id
                return (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/50 select-none"
                  >
                    <input
                      type="checkbox"
                      checked={col.getIsVisible()}
                      onChange={col.getToggleVisibilityHandler()}
                      className="accent-primary"
                    />
                    {label}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Scrollable table container */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <table
          className="text-sm"
          style={{ width: table.getTotalSize(), tableLayout: 'fixed' }}
        >
          <thead className="sticky top-0 z-10" style={{ backgroundColor: 'hsl(var(--card))' }}>
            {table.getHeaderGroups().map((headerGroup) => (
              <React.Fragment key={headerGroup.id}>
                {/* Column headers */}
                <tr className="border-b border-border">
                  {headerGroup.headers.map((header) => {
                    const sortable = header.column.getCanSort()
                    const sortDir = header.column.getIsSorted()
                    return (
                      <th
                        key={header.id}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, header.column.id)}
                        className={cn(
                          'relative h-10 px-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide',
                          'whitespace-nowrap select-none',
                          draggingId === header.column.id && 'opacity-40',
                        )}
                        style={{ width: header.getSize() }}
                      >
                        <div className="flex items-center gap-1">
                          {/* Drag handle — reorder only from here */}
                          <button
                            type="button"
                            draggable
                            onDragStart={(e) => handleDragStart(e, header.column.id)}
                            className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/70 flex-shrink-0 bg-transparent border-0 p-0"
                          >
                            <GripVertical className="h-3 w-3" />
                          </button>

                          {/* Label + sort */}
                            <button
                            type="button"
                            className={cn(
                              'flex items-center gap-1 flex-1 min-w-0 bg-transparent border-0 p-0 text-inherit',
                              sortable && 'cursor-pointer hover:text-foreground'
                            )}
                            onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                            {sortable && (
                              <span className="flex-shrink-0">
                                {(() => {
                                  if (sortDir === 'asc') return <ChevronUp className="h-3 w-3" />
                                  if (sortDir === 'desc') return <ChevronDown className="h-3 w-3" />
                                  return <ChevronsUpDown className="h-3 w-3 opacity-40" />
                                })()}
                              </span>
                            )}
                          </button>
                        </div>

                        {/* Resize handle — isolated from drag */}
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
                              header.column.getIsResizing() && 'bg-primary/70'
                            )}
                          />
                        )}
                      </th>
                    )
                  })}
                </tr>

                {/* Filter row */}
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
                          onChange={(e) =>
                            header.column.setFilterValue(e.target.value || undefined)
                          }
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
          <tbody>
            {(() => {
              if (isLoading) {
                const skeletonRows = Array.from({ length: 10 }, (_, i) => `skeleton-row-${i}`)
                const skeletonCols = table.getAllLeafColumns().map((col) => col.id)
                return skeletonRows.map((rowKey) => (
                  <tr key={rowKey} className="border-b border-border/50" style={{ height: ROW_HEIGHT }}>
                    {skeletonCols.map((colId) => (
                      <td key={`${rowKey}-${colId}`} className="px-3 py-2">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              }
              if (rows.length === 0) {
                return (
                  <tr>
                    <td
                      colSpan={table.getVisibleLeafColumns().length}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No records found
                    </td>
                  </tr>
                )
              }
              return (
              <>
                {paddingTop > 0 && (
                  <tr><td style={{ height: paddingTop }} /></tr>
                )}
                {virtualItems.map((vRow: VirtualItem) => {
                  const row = rows[vRow.index]
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-b border-border/50 transition-colors',
                        onRowClick && 'cursor-pointer hover:bg-muted/60',
                        selectedIds && getRowId && selectedIds.has(getRowId(row.original)) && 'bg-primary/10'
                      )}
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => onRowClick?.(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-3 py-2 align-middle"
                          style={{ width: cell.column.getSize(), maxWidth: cell.column.getSize(), overflow: 'hidden' }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {paddingBottom > 0 && (
                  <tr><td style={{ height: paddingBottom }} /></tr>
                )}
                {isFetchingNextPage && (
                  <tr>
                    <td
                      colSpan={table.getVisibleLeafColumns().length}
                      className="py-4 text-center text-xs text-muted-foreground"
                    >
                      Loading more…
                    </td>
                  </tr>
                )}
              </>
              )
            })()}
          </tbody>
        </table>
      </div>
    </div>
  )
}
