'use client'

import * as React from 'react'
import { Row, Table, flexRender } from '@tanstack/react-table'
import { type VirtualItem } from '@tanstack/react-virtual'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const ROW_HEIGHT = 44

interface DataTableBodyProps<TData> {
  readonly table: Table<TData>
  readonly rows: Row<TData>[]
  readonly virtualItems: VirtualItem[]
  readonly paddingTop: number
  readonly paddingBottom: number
  readonly isLoading: boolean
  readonly isFetchingNextPage?: boolean
  readonly onRowClick?: (row: TData) => void
  readonly selectedIds?: Set<string>
  readonly getRowId?: (row: TData) => string
}

export function DataTableBody<TData>({
  table,
  rows,
  virtualItems,
  paddingTop,
  paddingBottom,
  isLoading,
  isFetchingNextPage,
  onRowClick,
  selectedIds,
  getRowId,
}: DataTableBodyProps<TData>) {
  if (isLoading) {
    const skeletonRows = Array.from({ length: 10 }, (_, i) => `skeleton-row-${i}`)
    const skeletonCols = table.getAllLeafColumns().map((col) => col.id)
    return (
      <tbody>
        {skeletonRows.map((rowKey) => (
          <tr key={rowKey} className="border-b border-border/50" style={{ height: ROW_HEIGHT }}>
            {skeletonCols.map((colId) => (
              <td key={`${rowKey}-${colId}`} className="px-3 py-2">
                <Skeleton className="h-4 w-full" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    )
  }

  if (rows.length === 0) {
    return (
      <tbody>
        <tr>
          <td
            colSpan={table.getVisibleLeafColumns().length}
            className="h-32 text-center text-muted-foreground"
          >
            No records found
          </td>
        </tr>
      </tbody>
    )
  }

  return (
    <tbody>
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
              selectedIds && getRowId && selectedIds.has(getRowId(row.original)) && 'bg-primary/10',
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
    </tbody>
  )
}
