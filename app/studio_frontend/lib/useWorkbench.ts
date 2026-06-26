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

function hasFieldMismatch(r: WorkbenchRow): boolean {
  return (r.catalog_record_name !== null && r.display_name !== r.catalog_record_name)
    || (r.catalog_record_vendor !== null && r.display_vendor !== r.catalog_record_vendor)
    || (r.catalog_record_version !== null && r.disk_version !== r.catalog_record_version)
}

function classifySubState(r: WorkbenchRow): NeedsReviewSubState {
  return hasFieldMismatch(r) ? 'mismatch' : 'unconfirmed'
}

// Collision is no longer derived here (U-18): it is an authoritative backend bucket
// (`bucket === 'collision'`). needs_review rows are only mismatch vs unconfirmed.
function deriveSubStates(rows: WorkbenchRow[]): Map<string, NeedsReviewSubState> {
  const subStates = new Map<string, NeedsReviewSubState>()
  for (const r of rows) {
    if (r.bucket === 'needs_review' && r.catalog_record_id !== null) {
      subStates.set(r.result_id, classifySubState(r))
    }
  }
  return subStates
}

function matchesBucket(r: WorkbenchRow, f: WorkbenchClientFilters): boolean {
  return !f.bucket || r.bucket === f.bucket
}

function matchesCatalogType(r: WorkbenchRow, f: WorkbenchClientFilters): boolean {
  return !f.catalog_type || r.catalog_record_table === f.catalog_type
}

function matchesFormat(r: WorkbenchRow, f: WorkbenchClientFilters): boolean {
  return !f.format || r.disk_format === f.format
}

function matchesSubState(r: WorkbenchRow, subStates: Map<string, NeedsReviewSubState>, f: WorkbenchClientFilters): boolean {
  if (!f.needs_review_substate) return true
  return r.bucket === 'needs_review' && subStates.get(r.result_id) === f.needs_review_substate
}

function applyFilters(
  rows: WorkbenchRow[],
  subStates: Map<string, NeedsReviewSubState>,
  filters: WorkbenchClientFilters,
): WorkbenchRow[] {
  return rows.filter((r) =>
    matchesBucket(r, filters) &&
    matchesCatalogType(r, filters) &&
    matchesFormat(r, filters) &&
    matchesSubState(r, subStates, filters)
  )
}

function isActiveRow(r: WorkbenchRow): boolean {
  return r.bucket !== 'known' && r.bucket !== 'excluded' && r.catalog_record_id !== null
}

function isPassiveRow(r: WorkbenchRow): boolean {
  return (r.bucket === 'known' || r.bucket === 'excluded') && r.catalog_record_id !== null
}

function applySiblingFilter(rows: WorkbenchRow[]): WorkbenchRow[] {
  const activeSiblingIds = new Set<string>()
  for (const r of rows) {
    if (isActiveRow(r)) activeSiblingIds.add(r.catalog_record_id!)
  }
  return rows.filter((r) => !isPassiveRow(r) || activeSiblingIds.has(r.catalog_record_id!))
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
    const lastIdx = lastClickedIndex.current
    const fromIdx = lastIdx === null ? toIdx : Math.max(0, Math.min(lastIdx, visibleRows.length - 1))
    const lo = Math.min(fromIdx, toIdx)
    const hi = Math.max(fromIdx, toIdx)
    const rangeIds = visibleRows.slice(lo, hi + 1).map((r) => r.result_id)
    setSelectedIds((prev) => new Set([...prev, ...rangeIds]))
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
