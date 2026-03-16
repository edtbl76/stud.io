'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { DataTable } from '@/components/DataTable'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
}

export function TablePage<T>({
  title,
  endpoint,
  queryKey,
  columns,
  getRowId,
  renderModal,
}: TablePageProps<T>) {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [selectedRecord, setSelectedRecord] = React.useState<T | null | undefined>(undefined)
  // undefined = modal closed, null = create mode, T = view/edit mode

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data = [], isLoading, error } = useQuery({
    queryKey: [queryKey, debouncedSearch],
    queryFn: () => api.list<T>(endpoint, debouncedSearch || undefined),
  })

  function handleMutate() {
    queryClient.invalidateQueries({ queryKey: [queryKey] })
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

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {!isLoading && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.length} record{data.length !== 1 ? 's' : ''}
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
          <Button size="sm" onClick={handleAdd} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="px-6 py-3 bg-destructive/10 border-b border-destructive/20 text-sm text-destructive">
          Error loading data: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <DataTable
          columns={columns}
          data={data}
          onRowClick={handleRowClick}
          isLoading={isLoading}
        />
      </div>

      {/* Modal */}
      {selectedRecord !== undefined &&
        renderModal(selectedRecord, handleClose, handleMutate)}
    </div>
  )
}
