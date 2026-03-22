'use client'

import * as React from 'react'
import { Table } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SortField } from '@/lib/sort'

interface DataTableToolbarProps<TData> {
  readonly table: Table<TData>
  readonly activeFilterCount: number
  readonly onClearFilters: () => void
  readonly sortFields?: SortField[]
  readonly currentSort?: { id: string; desc: boolean }
  readonly onSortChange?: (id: string, desc: boolean) => void
}

export function DataTableToolbar<TData>({
  table,
  activeFilterCount,
  onClearFilters,
  sortFields,
  currentSort,
  onSortChange,
}: Readonly<DataTableToolbarProps<TData>>) {
  const [showColMenu, setShowColMenu] = React.useState(false)
  const [showSortMenu, setShowSortMenu] = React.useState(false)
  const colMenuRef = React.useRef<HTMLDivElement>(null)
  const sortMenuRef = React.useRef<HTMLDivElement>(null)

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

  React.useEffect(() => {
    if (!showSortMenu) return
    function handleClick(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showSortMenu])

  const currentField = sortFields?.find((f) => f.key === currentSort?.id)

  function handleSortFieldSelect(key: string) {
    onSortChange?.(key, currentSort?.desc ?? false)
    setShowSortMenu(false)
  }

  function handleDirectionToggle() {
    if (!currentSort) return
    onSortChange?.(currentSort.id, !currentSort.desc)
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
      </div>

      <div className="flex items-center gap-2">
        {sortFields && sortFields.length > 0 && (
          <div className="flex items-center gap-1">
            {currentSort && (
              <button
                type="button"
                onClick={handleDirectionToggle}
                aria-label={currentSort.desc ? 'Sort descending' : 'Sort ascending'}
                className="flex items-center justify-center h-[26px] w-[26px] text-muted-foreground hover:text-foreground rounded border border-border hover:border-muted-foreground transition-colors"
              >
                {currentSort.desc
                  ? <ArrowDown className="h-3.5 w-3.5" />
                  : <ArrowUp className="h-3.5 w-3.5" />}
              </button>
            )}
            <div className="relative" ref={sortMenuRef}>
              <button
                type="button"
                onClick={() => setShowSortMenu((v) => !v)}
                aria-label="Sort by"
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground rounded border border-border hover:border-muted-foreground transition-colors"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {currentField?.label ?? 'Sort'}
              </button>
              {showSortMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded border border-border bg-card shadow-lg py-1">
                  {sortFields.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => handleSortFieldSelect(f.key)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors',
                        currentSort?.id === f.key && 'text-primary font-medium',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

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
    </div>
  )
}
