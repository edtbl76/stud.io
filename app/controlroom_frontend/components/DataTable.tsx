'use client'

import * as React from 'react'
import {
  ColumnDef,
  ColumnFiltersState,
  ColumnOrderState,
  ColumnResizeMode,
  RowSelectionState,
  VisibilityState,
  getCoreRowModel,
  getFilteredRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { DataTableToolbar } from '@/components/DataTableToolbar'
import { DataTableHeader } from '@/components/DataTableHeader'
import { DataTableBody } from '@/components/DataTableBody'
import type { SortField } from '@/lib/sort'

const ROW_HEIGHT = 44

function makeSortingChangeHandler(
  externalSorting: SortingState | undefined,
  onExternalSortChange: ((s: SortingState) => void) | undefined,
): (updater: SortingState | ((prev: SortingState) => SortingState)) => void {
  return (updater) => {
    const next = typeof updater === 'function' ? updater(externalSorting ?? []) : updater
    onExternalSortChange?.(next)
  }
}

function compareValues(aVal: unknown, bVal: unknown, desc: boolean): number {
  if (aVal == null && bVal == null) return 0
  if (aVal == null) return 1
  if (bVal == null) return -1
  if (typeof aVal === 'string' && typeof bVal === 'string') {
    const cmp = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' })
    return desc ? -cmp : cmp
  }
  if (aVal < bVal) return desc ? 1 : -1
  if (aVal > bVal) return desc ? -1 : 1
  return 0
}

interface DataTableProps<TData, TValue> {
  readonly columns: ColumnDef<TData, TValue>[]
  readonly data: TData[]
  readonly onRowClick?: (row: TData) => void
  readonly isLoading?: boolean
  readonly rowSelection?: RowSelectionState
  readonly onRowSelectionChange?: React.Dispatch<React.SetStateAction<RowSelectionState>>
  readonly getRowId?: (row: TData) => string
  // Infinite scroll
  readonly hasNextPage?: boolean
  readonly fetchNextPage?: () => void
  readonly isFetchingNextPage?: boolean
  // Server-side sort (paginated tables)
  readonly manualSorting?: boolean
  readonly externalSorting?: SortingState
  readonly onExternalSortChange?: (sorting: SortingState) => void
  readonly sortFields?: SortField[]
  // Server-side column filters (paginated tables)
  readonly manualFiltering?: boolean
  readonly externalFilters?: Record<string, string>
  readonly onExternalFiltersChange?: (filters: Record<string, string>) => void
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  isLoading = false,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  manualSorting = false,
  externalSorting,
  onExternalSortChange,
  sortFields,
  manualFiltering = false,
  externalFilters,
  onExternalFiltersChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(
    !manualSorting && sortFields?.[0] ? [{ id: sortFields[0].key, desc: false }] : [],
  )

  const sortedData = React.useMemo(() => {
    if (manualSorting || sorting.length === 0) return data
    const { id, desc } = sorting[0]
    return [...data].sort((a, b) =>
      compareValues((a as Record<string, unknown>)[id], (b as Record<string, unknown>)[id], desc)
    )
  }, [data, sorting, manualSorting])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnOrder, setColumnOrder] = React.useState<ColumnOrderState>([])
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const table = useReactTable({
    data: sortedData,
    columns,
    state: {
      sorting: manualSorting ? (externalSorting ?? []) : sorting,
      columnFilters,
      columnVisibility,
      columnOrder,
      rowSelection: rowSelection ?? {},
    },
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    enableRowSelection: !!rowSelection,
    onRowSelectionChange,
    enableSorting: false,
    manualSorting,
    onSortingChange: manualSorting
      ? makeSortingChangeHandler(externalSorting, onExternalSortChange)
      : setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode: 'onChange' as ColumnResizeMode,
    enableColumnResizing: true,
  })

  const currentSortEntry = manualSorting ? (externalSorting?.[0]) : sorting[0]

  function handleSortChange(id: string, desc: boolean) {
    const next: SortingState = [{ id, desc }]
    onExternalSortChange?.(next)
    setSorting(next)
  }

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
  const paddingBottom = virtualItems.length > 0 ? totalSize - virtualItems.at(-1)!.end : 0

  const lastVirtualItem = virtualItems.at(-1)
  React.useEffect(() => {
    if (!lastVirtualItem || !hasNextPage || isFetchingNextPage) return
    if (lastVirtualItem.index >= rows.length - 5) {
      fetchNextPage?.()
    }
  }, [lastVirtualItem?.index, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage])

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

  const activeFilterCount = manualFiltering
    ? Object.keys(externalFilters ?? {}).length
    : columnFilters.length

  function handleClearFilters() {
    onExternalFiltersChange?.({})
    setColumnFilters([])
  }

  return (
    <div className="flex flex-col h-full">
      <DataTableToolbar
        table={table}
        activeFilterCount={activeFilterCount}
        onClearFilters={handleClearFilters}
        sortFields={sortFields}
        currentSort={currentSortEntry}
        onSortChange={handleSortChange}
      />
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <table
          className="text-sm"
          style={{ width: table.getTotalSize(), tableLayout: 'fixed' }}
        >
          <DataTableHeader
            table={table}
            draggingId={draggingId}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            manualFiltering={manualFiltering}
            externalFilters={externalFilters}
            onExternalFiltersChange={onExternalFiltersChange}
          />
          <DataTableBody
            table={table}
            rows={rows}
            virtualItems={virtualItems}
            paddingTop={paddingTop}
            paddingBottom={paddingBottom}
            isLoading={isLoading}
            isFetchingNextPage={isFetchingNextPage}
            onRowClick={onRowClick}
          />
        </table>
      </div>
    </div>
  )
}
