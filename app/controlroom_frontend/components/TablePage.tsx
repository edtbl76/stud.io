'use client'

import * as React from 'react'
import { useQuery, useInfiniteQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { ColumnDef, RowSelectionState, SortingState } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { DataTable } from '@/components/DataTable'
import { BulkEditBar } from '@/components/BulkEditBar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { BulkEditField } from '@/lib/bulkEdit'

// Checkbox column defined at module level with no external dependencies.
// Uses TanStack Table's native row selection API (table/row context) so the
// column definition is completely stable — selection state changes never
// recreate it and never trigger a full row-model rebuild.
function makeCheckboxColumn<T>(): ColumnDef<T, unknown> {
  return {
    id: '__select__',
    size: 40,
    enableSorting: false,
    enableResizing: false,
    header: ({ table }) => {
      const allSelected = table.getIsAllRowsSelected()
      const someSelected = table.getIsSomeRowsSelected()
      return (
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected }}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="accent-primary"
            aria-label="Select all"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )
    },
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          className="accent-primary"
          aria-label={`Select row ${row.id}`}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    ),
  }
}

function getNextPageParam(
  lastPage: { items: unknown[]; total: number },
  allPages: { items: unknown[]; total: number }[],
): number | undefined {
  const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0)
  return loaded < lastPage.total ? loaded : undefined
}

// ── Internal hooks ──

interface PagedTableProps {
  hasNextPage?: boolean
  fetchNextPage?: () => void
  isFetchingNextPage?: boolean
  manualSorting?: true
  externalSorting?: SortingState
  onExternalSortChange?: (s: SortingState) => void
}

interface UseTableDataResult<T> {
  data: T[]
  isLoading: boolean
  error: Error | null
  recordCountLabel: string
  search: string
  setSearch: (s: string) => void
  pagedTableProps: PagedTableProps
}

function useTableData<T>(endpoint: string, queryKey: string, paginated: boolean): UseTableDataResult<T> {
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [externalSorting, setExternalSorting] = React.useState<SortingState>([])

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const sortBy = externalSorting[0]?.id
  const sortDir = externalSorting[0]?.desc ? 'desc' : 'asc'

  const { data: listData = [], isLoading: isListLoading, error: listError } = useQuery({
    queryKey: [queryKey, debouncedSearch],
    queryFn: () => api.list<T>(endpoint, debouncedSearch || undefined),
    enabled: !paginated,
  })

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isInfiniteLoading,
    error: infiniteError,
  } = useInfiniteQuery({
    queryKey: [queryKey, debouncedSearch, sortBy, sortDir],
    queryFn: ({ pageParam }) =>
      api.listPaged<T>(endpoint, {
        q: debouncedSearch || undefined,
        limit: 100,
        offset: pageParam,
        sort_by: sortBy,
        sort_dir: sortDir,
      }),
    initialPageParam: 0,
    getNextPageParam,
    enabled: paginated,
    placeholderData: keepPreviousData,
  })

  const pagedItems = React.useMemo(
    () => infiniteData?.pages.flatMap((p) => p.items) ?? [],
    [infiniteData],
  )

  const data = paginated ? pagedItems : listData
  const isLoading = paginated ? isInfiniteLoading : isListLoading
  const error = paginated ? infiniteError : listError
  const pagedTotal = infiniteData?.pages.at(-1)?.total
  const totalRecords = paginated ? pagedTotal : data.length
  const plural = totalRecords === 1 ? '' : 's'
  const recordCountLabel =
    paginated && pagedTotal === undefined
      ? ''
      : `${totalRecords} record${plural}`

  const pagedTableProps: PagedTableProps = paginated
    ? { hasNextPage, fetchNextPage: () => void fetchNextPage?.(), isFetchingNextPage, manualSorting: true, externalSorting, onExternalSortChange: setExternalSorting }
    : {}

  return { data, isLoading, error, recordCountLabel, search, setSearch, pagedTableProps }
}

interface UseCheckboxSelectionResult<T> {
  rowSelection: RowSelectionState
  setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>
  selectedRows: T[]
  effectiveColumns: ColumnDef<T, unknown>[]
}

function useCheckboxSelection<T>(
  data: T[],
  getRowId: (row: T) => string,
  columns: ColumnDef<T, unknown>[],
  enabled: boolean,
): UseCheckboxSelectionResult<T> {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const selectedRows = React.useMemo(
    () => data.filter((row) => rowSelection[getRowId(row)]),
    [data, rowSelection, getRowId],
  )

  // Empty dep array: column definition is stable because it reads selection
  // state from TanStack Table's row/table context, not from closed-over state.
  const checkboxColumn = React.useMemo<ColumnDef<T, unknown>>(
    () => makeCheckboxColumn<T>(),
    [],
  )

  const effectiveColumns = enabled ? [checkboxColumn, ...columns] : columns

  return { rowSelection, setRowSelection, selectedRows, effectiveColumns }
}

// ── TablePage ──

interface TablePageProps<T> {
  title: string
  endpoint: string
  queryKey: string
  columns: ColumnDef<T, unknown>[]
  getRowId: (row: T) => string
  renderModal: (
    record: T | null,
    onClose: () => void,
    onMutate: () => void
  ) => React.ReactNode
  bulkEditFields?: BulkEditField[]
  paginated?: boolean
}

export function TablePage<T>({
  title,
  endpoint,
  queryKey,
  columns,
  getRowId,
  renderModal,
  bulkEditFields,
  paginated = false,
}: Readonly<TablePageProps<T>>) {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const showBulkEdit = isAdmin && !!bulkEditFields && bulkEditFields.length > 0
  const [selectedRecord, setSelectedRecord] = React.useState<T | null | undefined>(undefined)

  const { data, isLoading, error, recordCountLabel, search, setSearch, pagedTableProps } =
    useTableData<T>(endpoint, queryKey, paginated)

  const { rowSelection, setRowSelection, selectedRows, effectiveColumns } =
    useCheckboxSelection(data, getRowId, columns, showBulkEdit)

  function handleMutate() { void queryClient.invalidateQueries({ queryKey: [queryKey] }) }
  function handleRowClick(row: T) { setSelectedRecord(row) }
  function handleClose() { setSelectedRecord(undefined) }
  function handleAdd() { setSelectedRecord(null) }
  function handleBulkApply() { setRowSelection({}); handleMutate() }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {!isLoading && (
            <p className="text-xs text-muted-foreground mt-0.5">{recordCountLabel}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-56 h-8 text-xs"
          />
          {isAdmin && (
            <Button size="sm" onClick={handleAdd} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-destructive/10 border-b border-destructive/20 text-sm text-destructive">
          Error loading data: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {showBulkEdit && selectedRows.length > 0 && (
        <BulkEditBar
          selectedRows={selectedRows as unknown as Record<string, unknown>[]}
          fields={bulkEditFields ?? []}
          endpoint={endpoint}
          getRowId={(row) => getRowId(row as unknown as T)}
          onApply={handleBulkApply}
          onClear={() => setRowSelection({})}
        />
      )}

      <div className="flex-1 min-h-0">
        <DataTable
          columns={effectiveColumns}
          data={data}
          onRowClick={handleRowClick}
          isLoading={isLoading}
          rowSelection={showBulkEdit ? rowSelection : undefined}
          onRowSelectionChange={showBulkEdit ? setRowSelection : undefined}
          getRowId={getRowId}
          {...pagedTableProps}
        />
      </div>

      {selectedRecord !== undefined && renderModal(selectedRecord, handleClose, handleMutate)}
    </div>
  )
}
