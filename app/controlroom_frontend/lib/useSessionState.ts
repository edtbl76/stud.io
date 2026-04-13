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

function storageKey(username: string, queryKey: string): string {
  return `${STORAGE_PREFIX}${username}:${queryKey}`
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

function buildActive(inputs: FilterState): FilterState {
  const active: FilterState = {}
  for (const [key, entry] of Object.entries(inputs)) {
    const { value, operator } = entry
    if (VALUE_FREE_OPERATORS.has(operator)) { active[key] = entry; continue }
    if (!value) continue
    if (DATE_OPERATORS.has(operator)) { active[key] = entry; continue }
    const isQuoted = value.startsWith('"') && value.endsWith('"') && value.length >= 2
    if (isQuoted || value.length >= MIN_CHARS) active[key] = entry
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
  username: string,
  queryKey: string,
  columns: ColumnDef<unknown, unknown>[],
  defaultSort: string | undefined,
): SessionState {
  const key = storageKey(username, queryKey)
  const defaultSorting = React.useMemo(() => buildDefaultSorting(defaultSort), [defaultSort])
  const defaultVisibility = React.useMemo(
    () => buildDefaultVisibility(columns),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryKey],
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
