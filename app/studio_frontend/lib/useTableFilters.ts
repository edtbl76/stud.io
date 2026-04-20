'use client'

import * as React from 'react'
import {
  DEFAULT_OPERATOR,
  VALUE_FREE_OPERATORS,
  DATE_OPERATORS,
  type FilterEntry,
  type FilterState,
} from '@/lib/filterOperators'

const DEBOUNCE_MS = 350
const MIN_CHARS = 2

export interface UseTableFiltersResult {
  /** Raw values bound to filter inputs immediately (no debounce) */
  inputFilters: FilterState
  /** Debounced, validated values sent to the API */
  activeFilters: FilterState
  setFilterEntry: (colId: string, entry: FilterEntry | null) => void
  clearFilters: () => void
}

function buildActive(inputs: FilterState): FilterState {
  const active: FilterState = {}
  for (const [key, entry] of Object.entries(inputs)) {
    const { value, operator } = entry
    if (VALUE_FREE_OPERATORS.has(operator)) {
      active[key] = entry
      continue
    }
    if (!value) continue
    if (DATE_OPERATORS.has(operator)) {
      active[key] = entry
      continue
    }
    const isQuoted = value.startsWith('"') && value.endsWith('"') && value.length >= 2
    if (isQuoted || value.length >= MIN_CHARS) {
      active[key] = entry
    }
  }
  return active
}

export function useTableFilters(): UseTableFiltersResult {
  const [inputFilters, setInputFilters] = React.useState<FilterState>({})
  const [activeFilters, setActiveFilters] = React.useState<FilterState>({})

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setActiveFilters(buildActive(inputFilters))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [inputFilters])

  function setFilterEntry(colId: string, entry: FilterEntry | null) {
    setInputFilters((prev) => {
      if (entry === null) {
        const next = { ...prev }
        delete next[colId]
        return next
      }
      return { ...prev, [colId]: entry }
    })
  }

  function clearFilters() {
    setInputFilters({})
    setActiveFilters({})
  }

  return { inputFilters, activeFilters, setFilterEntry, clearFilters }
}

export function makeDefaultEntry(value: string): FilterEntry {
  return { value, operator: DEFAULT_OPERATOR }
}
