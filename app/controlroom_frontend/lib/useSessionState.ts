'use client'

import * as React from 'react'
import { ColumnDef, SortingState, VisibilityState, ColumnSizingState } from '@tanstack/react-table'
import {
  DEFAULT_OPERATOR,
  VALUE_FREE_OPERATORS,
  DATE_OPERATORS,
  type FilterEntry,
  type FilterState,
} from '@/lib/filterOperators'

const DEBOUNCE_MS = 350
const MIN_CHARS = 2
const STORAGE_PREFIX = 'cr:'

export interface SessionConfig {
  storageKey: string
  defaultSort?: string
}

export interface SessionState {
  inputFilters: FilterState
  activeFilters: FilterState
  setFilterEntry: (colId: string, entry: FilterEntry | null) => void
  clearFilters: () => void
  externalSorting: SortingState
  setExternalSorting: React.Dispatch<React.SetStateAction<SortingState>>
  columnVisibility: VisibilityState
  setColumnVisibility: React.Dispatch<React.SetStateAction<VisibilityState>>
  columnSizing: ColumnSizingState
  setColumnSizing: React.Dispatch<React.SetStateAction<ColumnSizingState>>
  isDirty: boolean
  resetView: () => void
}

interface StoredSession {
  filters?: FilterState
  sorting?: SortingState
  visibility?: VisibilityState
  sizing?: ColumnSizingState
}

function readStorage(key: string): StoredSession {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as StoredSession) : {}
  } catch {
    return {}
  }
}

function writeStorage(key: string, session: StoredSession): void {
  try {
    localStorage.setItem(key, JSON.stringify(session))
  } catch {
    // Quota exceeded or private browsing — degrade silently.
  }
}

function buildDefaultVisibility(columns: ColumnDef<unknown, unknown>[]): VisibilityState {
  const vis: VisibilityState = {}
  for (const col of columns) {
    if (!col.meta?.defaultHidden) continue
    const id = col.id ?? (col as { accessorKey?: string }).accessorKey
    if (id) vis[id] = false
  }
  return vis
}

function buildDefaultSorting(defaultSort: string | undefined): SortingState {
  return defaultSort ? [{ id: defaultSort, desc: false }] : []
}

function isEntryActive(entry: FilterEntry): boolean {
  const { value, operator } = entry
  if (VALUE_FREE_OPERATORS.has(operator)) return true
  if (!value) return false
  if (DATE_OPERATORS.has(operator)) return true
  const isQuoted = value.startsWith('"') && value.endsWith('"') && value.length >= 2
  return isQuoted || value.length >= MIN_CHARS
}

function buildActive(inputs: FilterState): FilterState {
  const active: FilterState = {}
  for (const [key, entry] of Object.entries(inputs)) {
    if (isEntryActive(entry)) active[key] = entry
  }
  return active
}

function sortingEqual(a: SortingState, b: SortingState): boolean {
  if (a.length !== b.length) return false
  return a.every((s, i) => s.id === b[i].id && s.desc === b[i].desc)
}

function visibilityEqual(a: VisibilityState, b: VisibilityState): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((k) => a[k] === b[k])
}

export function makeDefaultEntry(value: string): FilterEntry {
  return { value, operator: DEFAULT_OPERATOR }
}

export function useSessionState(
  config: SessionConfig,
  columns: ColumnDef<unknown, unknown>[],
): SessionState {
  const { storageKey, defaultSort } = config
  const key = `${STORAGE_PREFIX}${storageKey}`
  const defaultSorting = React.useMemo(() => buildDefaultSorting(defaultSort), [defaultSort])
  const defaultVisibility = React.useMemo(
    () => buildDefaultVisibility(columns),
    [columns],
  )

  const stored = React.useMemo(() => readStorage(key), [key])

  const [inputFilters, setInputFilters] = React.useState<FilterState>(stored.filters ?? {})
  const [activeFilters, setActiveFilters] = React.useState<FilterState>(
    () => buildActive(stored.filters ?? {}),
  )
  const [externalSorting, setExternalSorting] = React.useState<SortingState>(
    stored.sorting ?? defaultSorting,
  )
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(
    stored.visibility ?? defaultVisibility,
  )
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(
    stored.sizing ?? {},
  )

  // Refs hold the latest defaults so the sync effect can use them as fallbacks
  // without listing them as dependencies (avoids spurious rehydration on column changes).
  const defaultSortingRef = React.useRef(defaultSorting)
  defaultSortingRef.current = defaultSorting
  const defaultVisibilityRef = React.useRef(defaultVisibility)
  defaultVisibilityRef.current = defaultVisibility

  // Sync state when the storage key changes (e.g. username changes without unmount).
  // Skips first render: useState already initialized from stored on mount.
  // Depends only on `stored` so changes to defaults alone never overwrite live state.
  const hasMounted = React.useRef(false)
  React.useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }
    setInputFilters(stored.filters ?? {})
    setActiveFilters(() => buildActive(stored.filters ?? {}))
    setExternalSorting(stored.sorting ?? defaultSortingRef.current)
    setColumnVisibility(stored.visibility ?? defaultVisibilityRef.current)
    setColumnSizing(stored.sizing ?? {})
  }, [stored])

  // Debounce filters → activeFilters
  React.useEffect(() => {
    const timer = setTimeout(() => setActiveFilters(buildActive(inputFilters)), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [inputFilters])

  // Persist when state differs from defaults; remove the key when everything is default.
  React.useEffect(() => {
    const dirty =
      Object.keys(inputFilters).length > 0 ||
      !sortingEqual(externalSorting, defaultSorting) ||
      !visibilityEqual(columnVisibility, defaultVisibility) ||
      Object.keys(columnSizing).length > 0
    if (!dirty) {
      try { localStorage.removeItem(key) } catch { /* ignore */ }
      return
    }
    writeStorage(key, {
      filters: inputFilters,
      sorting: externalSorting,
      visibility: columnVisibility,
      sizing: columnSizing,
    })
  }, [key, inputFilters, externalSorting, columnVisibility, columnSizing, defaultSorting, defaultVisibility])

  const isDirty = React.useMemo(() => {
    if (Object.keys(inputFilters).length > 0) return true
    if (!sortingEqual(externalSorting, defaultSorting)) return true
    if (!visibilityEqual(columnVisibility, defaultVisibility)) return true
    if (Object.keys(columnSizing).length > 0) return true
    return false
  }, [inputFilters, externalSorting, defaultSorting, columnVisibility, defaultVisibility, columnSizing])

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

  function resetView() {
    setInputFilters({})
    setActiveFilters({})
    setExternalSorting(defaultSorting)
    setColumnVisibility(defaultVisibility)
    setColumnSizing({})
  }

  return {
    inputFilters, activeFilters, setFilterEntry, clearFilters,
    externalSorting, setExternalSorting,
    columnVisibility, setColumnVisibility,
    columnSizing, setColumnSizing,
    isDirty, resetView,
  }
}
