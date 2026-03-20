'use client'

import * as React from 'react'
import { Table } from '@tanstack/react-table'
import { SlidersHorizontal } from 'lucide-react'

interface DataTableToolbarProps<TData> {
  readonly table: Table<TData>
  readonly activeFilterCount: number
  readonly onClearFilters: () => void
}

export function DataTableToolbar<TData>({
  table,
  activeFilterCount,
  onClearFilters,
}: DataTableToolbarProps<TData>) {
  const [showColMenu, setShowColMenu] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!showColMenu) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowColMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showColMenu])

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
      <div className="relative" ref={menuRef}>
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
  )
}
