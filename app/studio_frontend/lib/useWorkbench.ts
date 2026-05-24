import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  NeedsReviewSubState,
  OrphanedRecord,
  WorkbenchBucket,
  WorkbenchClientFilters,
  WorkbenchRow,
  WorkbenchServerParams,
} from '@/lib/types'

const WORKBENCH_KEY = ['scanner', 'workbench'] as const

const DEFAULT_SERVER_PARAMS: WorkbenchServerParams = { show_confirmed: true }

const DEFAULT_CLIENT_FILTERS: WorkbenchClientFilters = {
  bucket: '',
  needs_review_substate: '',
  catalog_type: '',
  format: '',
}

function deriveSubStates(rows: WorkbenchRow[]): Map<string, NeedsReviewSubState> {
  const reviewRows = rows.filter((r) => r.bucket === 'needs_review' && r.catalog_record_id !== null)

  const catalogIdCounts = new Map<string, number>()
  for (const r of reviewRows) {
    const id = r.catalog_record_id as string
    catalogIdCounts.set(id, (catalogIdCounts.get(id) ?? 0) + 1)
  }

  const subStates = new Map<string, NeedsReviewSubState>()
  for (const r of reviewRows) {
    const id = r.catalog_record_id as string
    if ((catalogIdCounts.get(id) ?? 0) > 1) {
      subStates.set(r.result_id, 'collision')
    } else if (
      r.catalog_record_version !== null &&
      r.disk_version !== r.catalog_record_version
    ) {
      subStates.set(r.result_id, 'version mismatch')
    } else {
      subStates.set(r.result_id, 'unconfirmed')
    }
  }
  return subStates
}

function applyFilters(
  rows: WorkbenchRow[],
  subStates: Map<string, NeedsReviewSubState>,
  filters: WorkbenchClientFilters,
): WorkbenchRow[] {
  return rows.filter((r) => {
    if (filters.catalog_type && r.catalog_record_table !== filters.catalog_type) return false
    if (filters.format && r.disk_format !== filters.format) return false
    if (filters.needs_review_substate) {
      if (r.bucket !== 'needs_review') return false
      if (subStates.get(r.result_id) !== filters.needs_review_substate) return false
    }
    return true
  })
}

function applySiblingFilter(rows: WorkbenchRow[]): WorkbenchRow[] {
  const activeSiblingIds = new Set<string>()
  for (const r of rows) {
    if (r.bucket !== 'known' && r.bucket !== 'excluded' && r.catalog_record_id) {
      activeSiblingIds.add(r.catalog_record_id)
    }
  }
  return rows.filter((r) => {
    if ((r.bucket === 'known' || r.bucket === 'excluded') && r.catalog_record_id) {
      return activeSiblingIds.has(r.catalog_record_id)
    }
    return true
  })
}

export function useWorkbench() {
  const qc = useQueryClient()

  const [serverParams, setServerParams] = React.useState<WorkbenchServerParams>(DEFAULT_SERVER_PARAMS)
  const [clientFilters, setClientFilters] = React.useState<WorkbenchClientFilters>(DEFAULT_CLIENT_FILTERS)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const lastClickedIndex = React.useRef<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: [...WORKBENCH_KEY, serverParams],
    queryFn: () => api.scanner.workbench(serverParams),
  })

  const { visibleRows, rowSubStates } = React.useMemo(() => {
    const rawRows = data?.rows ?? []
    const siblingFiltered = applySiblingFilter(rawRows)
    const subStates = deriveSubStates(siblingFiltered)
    const filtered = applyFilters(siblingFiltered, subStates, clientFilters)
    return { visibleRows: filtered, rowSubStates: subStates }
  }, [data, clientFilters])

  function setServerBucket(bucket: WorkbenchBucket | undefined) {
    setServerParams((prev) => ({ ...prev, bucket }))
  }

  function setClientFilter(patch: Partial<WorkbenchClientFilters>) {
    setClientFilters((prev) => ({ ...prev, ...patch }))
  }

  function toggleSelect(id: string) {
    const idx = visibleRows.findIndex((r) => r.result_id === id)
    lastClickedIndex.current = idx >= 0 ? idx : null
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function shiftSelect(id: string) {
    const toIdx = visibleRows.findIndex((r) => r.result_id === id)
    if (toIdx < 0) return
    const fromIdx = lastClickedIndex.current ?? toIdx
    const lo = Math.min(fromIdx, toIdx)
    const hi = Math.max(fromIdx, toIdx)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (let i = lo; i <= hi; i++) next.add(visibleRows[i].result_id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(visibleRows.map((r) => r.result_id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
    lastClickedIndex.current = null
  }

  function invalidate() {
    void qc.invalidateQueries({ queryKey: WORKBENCH_KEY })
  }

  return {
    rows: visibleRows,
    orphaned: data?.orphaned ?? [] as OrphanedRecord[],
    isLoading,
    scanId: data?.scan_id ?? null,
    serverParams,
    setServerBucket,
    clientFilters,
    setClientFilter,
    selectedIds,
    toggleSelect,
    shiftSelect,
    selectAll,
    clearSelection,
    invalidate,
    rowSubStates,
  }
}
