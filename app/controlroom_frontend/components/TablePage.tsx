'use client'

import * as React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useQuery, useInfiniteQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { ColumnDef, RowSelectionState, SortingState } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/DataTable'
import { BulkEditBar } from '@/components/BulkEditBar'
import type { BulkEditField } from '@/lib/bulkEdit'
import type { SortField } from '@/lib/sort'
import { useTableFilters } from '@/lib/useTableFilters'
import '@/lib/columnMeta'

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
    enableColumnFilter: false,
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
  manualFiltering?: true
  externalFilters?: Record<string, string>
  onExternalFiltersChange?: (f: Record<string, string>) => void
}

interface UseTableDataResult<T> {
  data: T[]
  isLoading: boolean
  error: Error | null
  recordCountLabel: string
  pagedTableProps: PagedTableProps
}

function resolveFilterParams<T>(
  columns: ColumnDef<T, unknown>[],
  inputFilters: Record<string, string>,
): Record<string, string> {
  const paramMap = new Map<string, string>()
  for (const col of columns) {
    const id = col.id ?? (col as { accessorKey?: string }).accessorKey
    if (!id) continue
    const filterParam = col.meta?.filterParam ?? id
    paramMap.set(id, filterParam)
  }
  const resolved: Record<string, string> = {}
  for (const [colId, val] of Object.entries(inputFilters)) {
    const param = paramMap.get(colId) ?? colId
    resolved[param] = val
  }
  return resolved
}

function useTableData<T>(
  endpoint: string,
  queryKey: string,
  paginated: boolean,
  columns: ColumnDef<T, unknown>[],
  defaultSort?: string,
): UseTableDataResult<T> {
  const [externalSorting, setExternalSorting] = React.useState<SortingState>(
    defaultSort ? [{ id: defaultSort, desc: false }] : [],
  )
  const { inputFilters, activeFilters, setInputFilters } = useTableFilters()

  const sortBy = externalSorting.map((s) => s.id)
  const sortDir = externalSorting.map((s) => (s.desc ? 'desc' : 'asc'))
  const resolvedFilters = React.useMemo(
    () => resolveFilterParams(columns, activeFilters),
    [columns, activeFilters],
  )

  const { data: listData = [], isLoading: isListLoading, error: listError } = useQuery({
    queryKey: [queryKey],
    queryFn: () => api.list<T>(endpoint),
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
    queryKey: [queryKey, externalSorting, resolvedFilters],
    queryFn: ({ pageParam }) =>
      api.listPaged<T>(endpoint, {
        limit: 100,
        offset: pageParam,
        sort_by: sortBy.length > 0 ? sortBy : undefined,
        sort_dir: sortDir.length > 0 ? sortDir : undefined,
        filters: Object.keys(resolvedFilters).length > 0 ? resolvedFilters : undefined,
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
    ? {
        hasNextPage,
        fetchNextPage: () => void fetchNextPage?.(),
        isFetchingNextPage,
        manualSorting: true,
        externalSorting,
        onExternalSortChange: setExternalSorting,
        manualFiltering: true,
        externalFilters: inputFilters,
        onExternalFiltersChange: setInputFilters,
      }
    : {}

  return { data, isLoading, error, recordCountLabel, pagedTableProps }
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

// ── OpenIdHandler ──
// Null-rendering component that reads the ?open=<id> search param and
// calls onOpen(id) once, then clears the param from the URL. Kept
// separate so useSearchParams is inside a <Suspense> boundary.

function OpenIdHandler({
  endpoint,
  onOpen,
}: Readonly<{ endpoint: string; onOpen: (id: string, cleanup: () => void) => void }>) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const openId = searchParams.get('open')
  // Guard against React Strict Mode double-invocation: track which id was already handled.
  const processedRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!openId || processedRef.current === openId) return
    processedRef.current = openId
    onOpen(openId, () => router.replace(pathname, { scroll: false }))
  }, [openId, onOpen, router, pathname])

  return null
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
  sortFields?: SortField[]
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
  sortFields,
  paginated = false,
}: Readonly<TablePageProps<T>>) {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const showBulkEdit = isAdmin && !!bulkEditFields && bulkEditFields.length > 0
  const [selectedRecord, setSelectedRecord] = React.useState<T | null | undefined>(undefined)

  const { data, isLoading, error, recordCountLabel, pagedTableProps } =
    useTableData<T>(endpoint, queryKey, paginated, columns, sortFields?.[0]?.key)

  const { rowSelection, setRowSelection, selectedRows, effectiveColumns } =
    useCheckboxSelection(data, getRowId, columns, showBulkEdit)

  const handleOpenById = React.useCallback((id: string, cleanup: () => void) => {
    void api.get<T>(endpoint, id).then((record) => {
      setSelectedRecord(record)
      // Defer URL cleanup so React commits the state update before router.replace
      // triggers any re-render that could unmount the modal.
      setTimeout(cleanup, 0)
    }).catch(() => {})
  }, [endpoint, setSelectedRecord])

  function handleMutate() { void queryClient.invalidateQueries({ queryKey: [queryKey] }) }
  function handleAdd() { setSelectedRecord(null) }
  function handleRowClick(row: T) { setSelectedRecord(row) }
  function handleClose() { setSelectedRecord(undefined) }
  function handleBulkApply() { setRowSelection({}); handleMutate() }

  return (
    <div className="flex flex-col h-full">
      <React.Suspense fallback={null}>
        <OpenIdHandler endpoint={endpoint} onOpen={handleOpenById} />
      </React.Suspense>
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="flex items-center gap-3 mt-0.5">
          {!isLoading && (
            <p className="text-xs text-muted-foreground">{recordCountLabel}</p>
          )}
          {isAdmin && (
            <Button size="sm" onClick={handleAdd} className="gap-1.5 h-6 text-xs px-2">
              <Plus className="h-3 w-3" />
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
          sortFields={sortFields}
            {...pagedTableProps}
        />
      </div>

      {selectedRecord !== undefined && renderModal(selectedRecord, handleClose, handleMutate)}
    </div>
  )
}
