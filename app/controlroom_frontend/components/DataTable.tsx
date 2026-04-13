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
import type { FilterState, FilterEntry } from '@/lib/filterOperators'

const ROW_HEIGHT = 44
const MAX_SORT_LEVELS = 3

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

// Notifies parent of the post-filter visible row order. Uses element-by-reference
// comparison to skip the callback when the row set is unchanged — prevents an
// infinite setState loop that would otherwise occur because getRowModel() returns
// a new array wrapper on every render even when the underlying rows are stable.
function useNotifyVisibleData<TData>(
  visibleData: TData[],
  onSortedDataChange: ((data: TData[]) => void) | undefined,
) {
  const callbackRef = React.useRef(onSortedDataChange)
  const prevRef = React.useRef<TData[]>([])
  React.useLayoutEffect(() => { callbackRef.current = onSortedDataChange }, [onSortedDataChange])
  React.useEffect(() => {
    const prev = prevRef.current
    if (
      visibleData.length === prev.length &&
      visibleData.every((item, i) => item === prev[i])
    ) return
    prevRef.current = visibleData
    callbackRef.current?.(visibleData)
  }, [visibleData])
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
  readonly externalFilters?: FilterState
  readonly onFilterEntryChange?: (colId: string, entry: FilterEntry | null) => void
  readonly onClearFilters?: () => void
  // Navigation: called with the post-sort row order so the parent can track position
  readonly onSortedDataChange?: (data: TData[]) => void
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
  onFilterEntryChange,
  onClearFilters,
  onSortedDataChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(
    !manualSorting && sortFields?.[0] ? [{ id: sortFields[0].key, desc: false }] : [],
  )

  const sortedData = React.useMemo(() => {
    if (manualSorting || sorting.length === 0) return data
    return [...data].sort((a, b) => {
      for (const { id, desc } of sorting) {
        const cmp = compareValues(
          (a as Record<string, unknown>)[id],
          (b as Record<string, unknown>)[id],
          desc,
        )
        if (cmp !== 0) return cmp
      }
      return 0
    })
  }, [data, sorting, manualSorting])

  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() => {
    const initial: VisibilityState = {}
    for (const col of columns) {
      if (col.meta?.defaultHidden) {
        const id = col.id ?? (col as { accessorKey?: string }).accessorKey
        if (id) initial[id] = false
      }
    }
    return initial
  })
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

  const activeSorting = manualSorting ? (externalSorting ?? []) : sorting

  function handleSortAdd(id: string) {
    if (activeSorting.length >= MAX_SORT_LEVELS) return
    if (activeSorting.some((s) => s.id === id)) return
    const next: SortingState = [...activeSorting, { id, desc: false }]
    onExternalSortChange?.(next)
    setSorting(next)
  }

  function handleSortRemove(index: number) {
    const next = activeSorting.filter((_, i) => i !== index)
    onExternalSortChange?.(next)
    setSorting(next)
  }

  function handleSortToggleDir(index: number) {
    const next = activeSorting.map((s, i) => (i === index ? { ...s, desc: !s.desc } : s))
    onExternalSortChange?.(next)
    setSorting(next)
  }

  const rows = table.getRowModel().rows

  // Notify with post-filter visible rows so navigation follows what the user actually sees.
  const visibleData = React.useMemo(() => rows.map((r) => r.original), [rows])
  useNotifyVisibleData(visibleData, onSortedDataChange)

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
    onClearFilters?.()
    setColumnFilters([])
  }

  return (
    <div className="flex flex-col h-full">
      <DataTableToolbar
        table={table}
        activeFilterCount={activeFilterCount}
        onClearFilters={handleClearFilters}
        sortFields={sortFields}
        sorting={activeSorting}
        onSortAdd={handleSortAdd}
        onSortRemove={handleSortRemove}
        onSortToggleDir={handleSortToggleDir}
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
            onFilterEntryChange={onFilterEntryChange}
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
