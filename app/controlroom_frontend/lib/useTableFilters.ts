'use client'

import * as React from 'react'

const DEBOUNCE_MS = 350
const MIN_CHARS = 2

export interface UseTableFiltersResult {
  /** Raw values bound to filter inputs immediately (no debounce) */
  inputFilters: Record<string, string>
  /** Debounced, validated values sent to the API */
  activeFilters: Record<string, string>
  setInputFilters: (filters: Record<string, string>) => void
  clearFilters: () => void
}

function buildActive(inputs: Record<string, string>): Record<string, string> {
  const active: Record<string, string> = {}
  for (const [key, val] of Object.entries(inputs)) {
    if (!val) continue
    const isQuoted = val.startsWith('"') && val.endsWith('"') && val.length >= 2
    if (isQuoted || val.length >= MIN_CHARS) {
      active[key] = val  // quoted values bypass MIN_CHARS; backend detects and strips quotes
    }
  }
  return active
}

export function useTableFilters(): UseTableFiltersResult {
  const [inputFilters, setInputFilters] = React.useState<Record<string, string>>({})
  const [activeFilters, setActiveFilters] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setActiveFilters(buildActive(inputFilters))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [inputFilters])

  function clearFilters() {
    setInputFilters({})
    setActiveFilters({})
  }

  return { inputFilters, activeFilters, setInputFilters, clearFilters }
}
