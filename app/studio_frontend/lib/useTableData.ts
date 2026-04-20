'use client'

import * as React from 'react'
import { useQuery, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query'
import { ColumnDef, SortingState } from '@tanstack/react-table'
import { api } from '@/lib/api'
import type { FilterState, FilterEntry } from '@/lib/filterOperators'

export interface PagedTableProps {
  hasNextPage?: boolean
  fetchNextPage?: () => void
  isFetchingNextPage?: boolean
  isFetching?: boolean
  manualSorting?: true
  externalSorting?: SortingState
  onExternalSortChange?: (s: SortingState) => void
  manualFiltering?: true
  externalFilters?: FilterState
  onFilterEntryChange?: (colId: string, entry: FilterEntry | null) => void
  onClearFilters?: () => void
}

export interface UseTableDataResult<T> {
  data: T[]
  isLoading: boolean
  error: Error | null
  recordCountLabel: string
  pagedTableProps: PagedTableProps
}

export interface TableDataSession {
  externalSorting: SortingState
  setExternalSorting: React.Dispatch<React.SetStateAction<SortingState>>
  inputFilters: FilterState
  activeFilters: FilterState
  setFilterEntry: (colId: string, entry: FilterEntry | null) => void
  clearFilters: () => void
}

function getNextPageParam(
  lastPage: { items: unknown[]; total: number },
  allPages: { items: unknown[]; total: number }[],
): number | undefined {
  const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0)
  return loaded < lastPage.total ? loaded : undefined
}

function resolveFilterParams<T>(
  columns: ColumnDef<T, unknown>[],
  inputFilters: FilterState,
): FilterState {
  const paramMap = new Map<string, string>()
  for (const col of columns) {
    const id = col.id ?? (col as { accessorKey?: string }).accessorKey
    if (!id) continue
    paramMap.set(id, col.meta?.filterParam ?? id)
  }
  const resolved: FilterState = {}
  for (const [colId, entry] of Object.entries(inputFilters)) {
    resolved[paramMap.get(colId) ?? colId] = entry
  }
  return resolved
}

export function useTableData<T>(
  endpoint: string,
  queryKey: string,
  paginated: boolean,
  columns: ColumnDef<T, unknown>[],
  session: TableDataSession,
): UseTableDataResult<T> {
  const { externalSorting, setExternalSorting, inputFilters, activeFilters, setFilterEntry, clearFilters } = session

  const sortBy = externalSorting.map((s) => s.id)
  const sortDir = externalSorting.map((s) => (s.desc ? 'desc' : 'asc'))
  const resolvedFilters = React.useMemo(
    () => resolveFilterParams(columns, activeFilters),
    [columns, activeFilters],
  )

  const { data: listData = [], isLoading: isListLoading, error: listError } = useQuery({
    queryKey: [queryKey],
    queryFn: () => api.list<T>(endpoint),
    enabled: !paginated,
  })

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching: isInfiniteFetching,
    isLoading: isInfiniteLoading,
    error: infiniteError,
  } = useInfiniteQuery({
    queryKey: [queryKey, externalSorting, resolvedFilters],
    queryFn: ({ pageParam }) =>
      api.listPaged<T>(endpoint, {
        limit: 100,
        offset: pageParam,
        sort_by: sortBy.length > 0 ? sortBy : undefined,
        sort_dir: sortDir.length > 0 ? sortDir : undefined,
        filters: Object.keys(resolvedFilters).length > 0 ? resolvedFilters : undefined,
      }),
    initialPageParam: 0,
    getNextPageParam,
    enabled: paginated,
    placeholderData: keepPreviousData,
  })

  const pagedItems = React.useMemo(
    () => infiniteData?.pages.flatMap((p) => p.items) ?? [],
    [infiniteData],
  )

  const data = paginated ? pagedItems : listData
  const isLoading = paginated ? isInfiniteLoading : isListLoading
  const error = paginated ? infiniteError : listError
  const pagedTotal = infiniteData?.pages.at(-1)?.total
  const totalRecords = paginated ? pagedTotal : data.length
  const plural = totalRecords === 1 ? '' : 's'
  const recordCountLabel =
    paginated && pagedTotal === undefined ? '' : `${totalRecords} record${plural}`

  const pagedTableProps: PagedTableProps = paginated
    ? {
        hasNextPage,
        fetchNextPage: () => { fetchNextPage?.() },
        isFetchingNextPage,
        isFetching: isInfiniteFetching,
        manualSorting: true,
        externalSorting,
        onExternalSortChange: setExternalSorting,
        manualFiltering: true,
        externalFilters: inputFilters,
        onFilterEntryChange: setFilterEntry,
        onClearFilters: clearFilters,
      }
    : {}

  return { data, isLoading, error, recordCountLabel, pagedTableProps }
}
