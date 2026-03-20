'use client'

import * as React from 'react'
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef, SortingState } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { DataTable } from '@/components/DataTable'
import { BulkEditBar } from '@/components/BulkEditBar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { BulkEditField } from '@/lib/bulkEdit'

// ── Checkbox sub-components (defined at module level, not inside TablePage) ──

interface SelectAllHeaderProps {
  visibleIds: string[]
  selectedIds: Set<string>
  onSelectAll: (ids: Set<string>) => void
}

function SelectAllHeader({ visibleIds, selectedIds, onSelectAll }: Readonly<SelectAllHeaderProps>) {
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const someSelected = visibleIds.some((id) => selectedIds.has(id))
  return (
    <div className="flex items-center justify-center">
      <input
        type="checkbox"
        checked={allSelected}
        ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected }}
        onChange={() => { onSelectAll(allSelected ? new Set() : new Set(visibleIds)) }}
        className="accent-primary"
        aria-label="Select all"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

interface SelectRowCellProps {
  rowId: string
  isSelected: boolean
  onToggle: (id: string) => void
}

function SelectRowCell({ rowId, isSelected, onToggle }: Readonly<SelectRowCellProps>) {
  return (
    <div className="flex items-center justify-center">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(rowId)}
        className="accent-primary"
        aria-label={`Select row ${rowId}`}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

// Factory defined at module level so the header/cell renderers are not
// treated as nested component definitions inside TablePage.
function makeCheckboxColumn<T>(
  getRowId: (row: T) => string,
  selectedIds: Set<string>,
  onSelectAll: (ids: Set<string>) => void,
  onToggle: (id: string) => void,
): ColumnDef<T, unknown> {
  return {
    id: '__select__',
    size: 40,
    enableSorting: false,
    enableResizing: false,
    header: ({ table }) => (
      <SelectAllHeader
        visibleIds={table.getRowModel().rows.map((r) => getRowId(r.original))}
        selectedIds={selectedIds}
        onSelectAll={onSelectAll}
      />
    ),
    cell: ({ row }) => {
      const rowId = getRowId(row.original)
      return (
        <SelectRowCell
          rowId={rowId}
          isSelected={selectedIds.has(rowId)}
          onToggle={onToggle}
        />
      )
    },
  }
}

function getNextPageParam(
  lastPage: { items: unknown[]; total: number },
  allPages: { items: unknown[]; total: number }[],
): number | undefined {
  const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0)
  return loaded < lastPage.total ? loaded : undefined
}

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
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [selectedRecord, setSelectedRecord] = React.useState<T | null | undefined>(undefined)
  // undefined = modal closed, null = create mode, T = view/edit mode
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [externalSorting, setExternalSorting] = React.useState<SortingState>([])

  const showBulkEdit = isAdmin && !!bulkEditFields && bulkEditFields.length > 0

  const sortBy = externalSorting[0]?.id
  const sortDir = externalSorting[0]?.desc ? 'desc' : 'asc'

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Non-paginated query
  const { data: listData = [], isLoading: isListLoading, error: listError } = useQuery({
    queryKey: [queryKey, debouncedSearch],
    queryFn: () => api.list<T>(endpoint, debouncedSearch || undefined),
    enabled: !paginated,
  })

  // Paginated / infinite-scroll query
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
  })

  const pagedItems = React.useMemo(
    () => infiniteData?.pages.flatMap((p) => p.items) ?? [],
    [infiniteData],
  )
  const pagedTotal = infiniteData?.pages.at(-1)?.total

  const data = paginated ? pagedItems : listData
  const isLoading = paginated ? isInfiniteLoading : isListLoading
  const error = paginated ? infiniteError : listError

  const totalRecords = paginated ? pagedTotal : data.length
  const recordPlural = totalRecords === 1 ? '' : 's'
  const recordCountLabel =
      paginated && pagedTotal === undefined
          ? ''
          : `${totalRecords} record${recordPlural}`

  const selectedRows = React.useMemo(
    () => data.filter((row) => selectedIds.has(getRowId(row))),
    [data, selectedIds, getRowId]
  )

  // Checkbox column — only built when bulk edit is available
  const checkboxColumn = React.useMemo<ColumnDef<T, unknown>>(
    () => makeCheckboxColumn(
      getRowId,
      selectedIds,
      setSelectedIds,
      (id) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
      },
    ),
    [selectedIds, getRowId],
  )

  const effectiveColumns = showBulkEdit ? [checkboxColumn, ...columns] : columns

  const pagedTableProps = paginated
    ? { hasNextPage, fetchNextPage, isFetchingNextPage, manualSorting: true as const, externalSorting, onExternalSortChange: setExternalSorting }
    : {}

  function handleMutate() {
    void queryClient.invalidateQueries({ queryKey: [queryKey] })
  }

  function handleRowClick(row: T) {
    setSelectedRecord(row)
  }

  function handleClose() {
    setSelectedRecord(undefined)
  }

  function handleAdd() {
    setSelectedRecord(null)
  }

  function handleBulkApply() {
    setSelectedIds(new Set())
    handleMutate()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {!isLoading && (
            <p className="text-xs text-muted-foreground mt-0.5">
                {recordCountLabel}
            </p>
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

      {/* Error state */}
      {error && (
        <div className="px-6 py-3 bg-destructive/10 border-b border-destructive/20 text-sm text-destructive">
          Error loading data: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {/* Bulk edit bar */}
      {isAdmin && bulkEditFields && bulkEditFields.length > 0 && selectedRows.length > 0 && (
        <BulkEditBar
          selectedRows={selectedRows as unknown as Record<string, unknown>[]}
          fields={bulkEditFields}
          endpoint={endpoint}
          getRowId={(row) => getRowId(row as unknown as T)}
          onApply={handleBulkApply}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <DataTable
          columns={effectiveColumns}
          data={data}
          onRowClick={handleRowClick}
          isLoading={isLoading}
          selectedIds={showBulkEdit ? selectedIds : undefined}
          getRowId={showBulkEdit ? getRowId : undefined}
          {...pagedTableProps}
        />
      </div>

      {/* Modal */}
      {selectedRecord !== undefined &&
        renderModal(selectedRecord, handleClose, handleMutate)}
    </div>
  )
}
