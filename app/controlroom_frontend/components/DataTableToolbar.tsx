'use client'

import * as React from 'react'
import { Table, SortingState } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, Plus, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SortField } from '@/lib/sort'

const MAX_SORT_LEVELS = 3

interface DataTableToolbarProps<TData> {
  readonly table: Table<TData>
  readonly activeFilterCount: number
  readonly onClearFilters: () => void
  readonly sortFields?: SortField[]
  readonly sorting?: SortingState
  readonly onSortAdd?: (id: string) => void
  readonly onSortRemove?: (index: number) => void
  readonly onSortToggleDir?: (index: number) => void
  readonly isDirty?: boolean
  readonly onResetView?: () => void
}

function ColumnMenu<TData>({ table }: Readonly<{ table: Table<TData> }>) {
  const [showColMenu, setShowColMenu] = React.useState(false)
  const colMenuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!showColMenu) return
    function handleClick(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showColMenu])

  return (
    <div className="relative" ref={colMenuRef}>
      <button
        onClick={() => setShowColMenu((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground rounded border border-border hover:border-muted-foreground transition-colors"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Columns
      </button>
      {showColMenu && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded border border-border bg-card shadow-lg py-1">
          {table.getAllLeafColumns().filter((col) => col.getCanHide()).map((col) => {
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
  )
}

function ResetViewButton({ isDirty, onResetView }: Readonly<{ isDirty?: boolean; onResetView?: () => void }>) {
  if (!isDirty || !onResetView) return null
  return (
    <button
      onClick={onResetView}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title="Reset filters, sort, columns, and widths to defaults"
    >
      <RotateCcw className="h-3 w-3" />
      Reset View
    </button>
  )
}

export function DataTableToolbar<TData>({
  table,
  activeFilterCount,
  onClearFilters,
  sortFields,
  sorting = [],
  onSortAdd,
  onSortRemove,
  onSortToggleDir,
  isDirty,
  onResetView,
}: Readonly<DataTableToolbarProps<TData>>) {
  const [showAddMenu, setShowAddMenu] = React.useState(false)
  const addMenuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!showAddMenu) return
    function handleClick(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showAddMenu])

  const availableFields = sortFields?.filter((f) => !sorting.some((s) => s.id === f.key)) ?? []
  const canAddMore = sortFields && sortFields.length > 0 && sorting.length < MAX_SORT_LEVELS && availableFields.length > 0

  function handleAddField(key: string) {
    onSortAdd?.(key)
    setShowAddMenu(false)
  }

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
      <div className="flex items-center gap-2">
        {activeFilterCount > 0 && (
          <button
            onClick={onClearFilters}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </button>
        )}
        <ResetViewButton isDirty={isDirty} onResetView={onResetView} />
      </div>

      <div className="flex items-center gap-2">
        {sortFields && sortFields.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {sorting.map((entry, i) => {
              const field = sortFields.find((f) => f.key === entry.id)
              return (
                <div
                  key={`${entry.id}-${i}`}
                  className="flex items-center gap-0.5 px-2 py-0.5 text-xs rounded border border-border bg-muted/30"
                >
                  <span className="text-foreground pr-0.5">{field?.label ?? entry.id}</span>
                  <button
                    type="button"
                    onClick={() => onSortToggleDir?.(i)}
                    aria-label={entry.desc ? 'Sort descending' : 'Sort ascending'}
                    className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {entry.desc
                      ? <ArrowDown className="h-3 w-3" />
                      : <ArrowUp className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSortRemove?.(i)}
                    aria-label={`Remove ${field?.label ?? entry.id} sort`}
                    className="flex items-center text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}

            {canAddMore && (
              <div className="relative" ref={addMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowAddMenu((v) => !v)}
                  aria-label="Add sort level"
                  className={cn(
                    'flex items-center justify-center h-[22px] w-[22px] text-muted-foreground hover:text-foreground',
                    'rounded border border-border hover:border-muted-foreground transition-colors',
                  )}
                >
                  <Plus className="h-3 w-3" />
                </button>
                {showAddMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded border border-border bg-card shadow-lg py-1">
                    {availableFields.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => handleAddField(f.key)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <ColumnMenu table={table} />
      </div>
    </div>
  )
}
