'use client'

import * as React from 'react'
import { Filter, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  OPERATOR_LABELS,
  VALUE_FREE_OPERATORS,
  DATE_OPERATORS,
  DATE_RANGE_OPERATORS,
  TEXT_FILTER_OPERATORS,
  DEFAULT_OPERATOR,
  type FilterEntry,
  type FilterOperator,
} from '@/lib/filterOperators'

interface FilterCellProps {
  readonly colId: string
  readonly entry: FilterEntry | undefined
  readonly filterOperators?: FilterOperator[]
  readonly onEntryChange: (colId: string, entry: FilterEntry | null) => void
}

const DATE_INPUT_CLASS = cn(
  'flex-1 min-w-0 bg-transparent border border-border/60 rounded px-2 py-0.5',
  'text-xs text-foreground focus:outline-none focus:border-primary/60 transition-colors',
  '[color-scheme:dark]',
)

const TEXT_INPUT_CLASS = cn(
  'flex-1 min-w-0 bg-transparent border border-border/60 rounded px-2 py-0.5',
  'text-xs text-foreground placeholder:text-muted-foreground/30',
  'focus:outline-none focus:border-primary/60 transition-colors',
)

function isDateOperator(op: FilterOperator): boolean {
  return DATE_OPERATORS.has(op)
}

export function FilterCell({ colId, entry, filterOperators, onEntryChange }: FilterCellProps) {
  const [popoverOpen, setPopoverOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const operator = entry?.operator ?? DEFAULT_OPERATOR
  const value = entry?.value ?? ''
  const valueEnd = entry?.value_end ?? ''
  const isValueFree = VALUE_FREE_OPERATORS.has(operator)
  const isDate = isDateOperator(operator)
  const isDateRange = DATE_RANGE_OPERATORS.has(operator)
  const hasActiveFilter = isValueFree ? !!entry : !!value

  const availableOps = filterOperators ?? TEXT_FILTER_OPERATORS

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleOperatorSelect(nextOp: FilterOperator) {
    setPopoverOpen(false)
    const nextValue = VALUE_FREE_OPERATORS.has(nextOp) ? '' : value
    onEntryChange(colId, { value: nextValue, operator: nextOp })
  }

  function handleValueChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.value) {
      onEntryChange(colId, null)
      return
    }
    onEntryChange(colId, { value: e.target.value, operator, value_end: valueEnd || undefined })
  }

  function handleValueEndChange(e: React.ChangeEvent<HTMLInputElement>) {
    onEntryChange(colId, { value, operator, value_end: e.target.value || undefined })
  }

  function handleClear() {
    onEntryChange(colId, null)
  }

  const showOperatorButton = availableOps.length > 1

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">
      {showOperatorButton && (
        <div className="relative flex-shrink-0">
          <button
            type="button"
            aria-label="Filter operator"
            onClick={() => setPopoverOpen((o) => !o)}
            className={cn(
              'flex items-center justify-center rounded p-0.5 border transition-colors bg-transparent',
              hasActiveFilter
                ? 'border-primary/60 text-primary'
                : 'border-border/60 text-muted-foreground/50 hover:text-muted-foreground',
            )}
          >
            <Filter className="h-3 w-3" />
          </button>

          {popoverOpen && (
            <div className="absolute z-50 top-full mt-1 left-0 min-w-max rounded-md border border-border bg-card shadow-xl py-1">
              {availableOps.map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => handleOperatorSelect(op)}
                  className={cn(
                    'flex w-full items-center px-3 py-1 text-xs text-left hover:bg-muted transition-colors',
                    operator === op && 'text-primary font-medium',
                  )}
                >
                  {OPERATOR_LABELS[op]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!isValueFree && !isDateRange && (
        <input
          type={isDate ? 'date' : 'text'}
          value={value}
          onChange={handleValueChange}
          placeholder={isDate ? undefined : '2+ chars…'}
          className={isDate ? DATE_INPUT_CLASS : TEXT_INPUT_CLASS}
        />
      )}

      {isDateRange && (
        <>
          <input
            type="date"
            value={value}
            onChange={handleValueChange}
            className={DATE_INPUT_CLASS}
          />
          <span className="text-muted-foreground/50 text-xs flex-shrink-0">–</span>
          <input
            type="date"
            value={valueEnd}
            onChange={handleValueEndChange}
            className={DATE_INPUT_CLASS}
          />
        </>
      )}

      {hasActiveFilter && (
        <button
          type="button"
          aria-label="Clear filter"
          onClick={handleClear}
          className="flex-shrink-0 text-muted-foreground/50 hover:text-muted-foreground bg-transparent border-0 p-0"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
