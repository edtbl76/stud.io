'use client'

import * as React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/DataTable'
import { BulkEditBar } from '@/components/BulkEditBar'
import { RecordModalNavigation } from '@/components/RecordModal'
import type { BulkEditField } from '@/lib/bulkEdit'
import type { SortField } from '@/lib/sort'
import { useRecordNavigation } from '@/lib/useRecordNavigation'
import { useSessionState } from '@/lib/useSessionState'
import { useTableData } from '@/lib/useTableData'
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

function getNavProviderKey<T>(record: T | null, getRowId: (r: T) => string): string {
  return record === null ? '__new__' : getRowId(record)
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
  const checkboxColumn = React.useMemo<ColumnDef<T, unknown>>(() => makeCheckboxColumn<T>(), [])

  return { rowSelection, setRowSelection, selectedRows, effectiveColumns: enabled ? [checkboxColumn, ...columns] : columns }
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
  const { role, username } = useAuth()
  const isAdmin = role === 'admin'
  const showBulkEdit = isAdmin && !!bulkEditFields && bulkEditFields.length > 0
  const [selectedRecord, setSelectedRecord] = React.useState<T | null | undefined>(undefined)

  const [navData, setNavData] = React.useState<T[]>([])
  const handleSortedDataChange = React.useCallback((sorted: T[]) => setNavData(sorted), [])

  const navValue = useRecordNavigation({
    data: navData,
    currentRecord: selectedRecord ?? null,
    getRecordId: getRowId,
    onNavigate: setSelectedRecord,
  })

  const session = useSessionState(
    { username: username ?? 'guest', queryKey, defaultSort: sortFields?.[0]?.key },
    columns as ColumnDef<unknown, unknown>[],
  )

  const { data, isLoading, error, recordCountLabel, pagedTableProps } =
    useTableData<T>(endpoint, queryKey, paginated, columns, session)

  const { rowSelection, setRowSelection, selectedRows, effectiveColumns } =
    useCheckboxSelection(data, getRowId, columns, showBulkEdit)

  const handleOpenById = React.useCallback((id: string, cleanup: () => void) => {
    void api.get<T>(endpoint, id).then((record) => {
      setSelectedRecord(record)
      setTimeout(cleanup, 0)
    }).catch(() => {})
  }, [endpoint])

  function handleMutate() { queryClient.invalidateQueries({ queryKey: [queryKey] }).catch(() => {}) }
  function handleAdd() { setSelectedRecord(null) }
  function handleRowClick(row: T) { setSelectedRecord(row) }
  function handleClose() { setSelectedRecord(undefined) }
  function handleBulkApply() { setRowSelection({}); handleMutate() }

  const rowSelectionProps = showBulkEdit
    ? { rowSelection, onRowSelectionChange: setRowSelection }
    : { rowSelection: undefined, onRowSelectionChange: undefined }

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
          getRowId={getRowId}
          sortFields={sortFields}
          onSortedDataChange={handleSortedDataChange}
          columnVisibility={session.columnVisibility}
          onColumnVisibilityChange={session.setColumnVisibility}
          columnSizing={session.columnSizing}
          onColumnSizingChange={session.setColumnSizing}
          isDirty={session.isDirty}
          onResetView={session.resetView}
          {...rowSelectionProps}
          {...pagedTableProps}
        />
      </div>

      {selectedRecord !== undefined && (
        <RecordModalNavigation.Provider
          key={getNavProviderKey(selectedRecord, getRowId)}
          value={navValue}
        >
          {renderModal(selectedRecord, handleClose, handleMutate)}
        </RecordModalNavigation.Provider>
      )}
    </div>
  )
}
