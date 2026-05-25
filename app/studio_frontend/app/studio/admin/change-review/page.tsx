'use client'

import * as React from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { DiffModal } from '@/components/DiffModal'
import { NativeSelect } from '@/components/ui/NativeSelect'
import type { AuditEntry, AuditEntryWithData, ChangeReviewResponse } from '@/lib/types'
import { useChangeReviewBulk } from '@/lib/useChangeReviewBulk'
import { ChangeReviewBulkBar } from '@/components/admin/ChangeReviewBulkBar'
import { ChangeReviewTable, type EntryAction } from './ChangeReviewTable'

const TABLE_NAMES = [
  'brands', 'models',
  'effects', 'instruments', 'libraries', 'workstations',
  'admin_tools', 'composition_tools', 'measurement_tools',
  'reference_tools', 'workflow_tools',
  'effect_types', 'entity_types', 'instrument_types',
  'model_types', 'plugin_formats', 'tag_types', 'tool_types',
] as const

const PAGE_SIZE = 50

function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError'
}

interface ListFilters {
  tableFilter: string
  operationFilter: string
  statusFilter: string
  page: number
}

function buildListUrl({ tableFilter, operationFilter, statusFilter, page }: ListFilters): string {
  const params = new URLSearchParams()
  if (tableFilter) params.set('table', tableFilter)
  if (operationFilter) params.set('operation', operationFilter)
  params.set('status', statusFilter)
  params.set('page', String(page))
  params.set('page_size', String(PAGE_SIZE))
  return `/api/studio/admin/change-review?${params}`
}

function fetchChangeReview(
  filters: ListFilters,
  signal: AbortSignal,
  onSuccess: (data: ChangeReviewResponse) => void,
  onError: () => void,
): void {
  void fetch(buildListUrl(filters), { signal })
    .then((res) => {
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json() as Promise<ChangeReviewResponse>
    })
    .then(onSuccess)
    .catch((e: unknown) => {
      if (isAbortError(e)) return
      onError()
    })
}

function removeEntry(
  prev: ChangeReviewResponse | null,
  isMatch: (e: AuditEntry) => boolean,
): ChangeReviewResponse | null {
  if (!prev) return prev
  if (!prev.entries.some(isMatch)) return prev
  return { ...prev, entries: prev.entries.filter((e) => !isMatch(e)), total: prev.total - 1 }
}

function useRowActions(
  setData: React.Dispatch<React.SetStateAction<ChangeReviewResponse | null>>,
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>,
) {
  const [rowErrors, setRowErrors] = React.useState<Record<string, string>>({})
  const [pendingActions, setPendingActions] = React.useState<Set<string>>(new Set())
  const [detailEntry, setDetailEntry] = React.useState<AuditEntryWithData | null>(null)
  const [loadingDetail, setLoadingDetail] = React.useState<string | null>(null)
  const errorTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  React.useEffect(() => {
    return () => { Object.values(errorTimers.current).forEach(clearTimeout) }
  }, [])

  function setRowError(auditId: string, message: string) {
    setRowErrors((prev) => ({ ...prev, [auditId]: message }))
    if (errorTimers.current[auditId]) clearTimeout(errorTimers.current[auditId])
    errorTimers.current[auditId] = setTimeout(() => {
      setRowErrors((prev) => {
        const next = { ...prev }
        delete next[auditId]
        return next
      })
      delete errorTimers.current[auditId]
    }, 5000)
  }

  async function handleRowClick(auditId: string) {
    setLoadingDetail(auditId)
    try {
      const res = await fetch(`/api/studio/admin/change-review/${auditId}`)
      if (!res.ok) throw new Error('Failed to load detail')
      const entry = await res.json() as AuditEntryWithData
      setDetailEntry(entry)
    } catch {
      setRowError(auditId, 'Could not load detail')
    } finally {
      setLoadingDetail(null)
    }
  }

  function applyRemoval(auditId: string) {
    setData((prev) => removeEntry(prev, (e) => e.audit_id === auditId))
    setRefreshKey((k) => k + 1)
  }

  async function handleAction(auditId: string, action: EntryAction) {
    setPendingActions((prev) => new Set(prev).add(auditId))
    try {
      const res = await fetch(`/api/studio/admin/change-review/${auditId}/${action.path}`, { method: action.method })
      if (res.status === 204) {
        applyRemoval(auditId)
        return
      }
      const body = await res.json()
      if (!res.ok) {
        setRowError(auditId, (body as { detail?: string })?.detail ?? 'Action failed, please try again')
        return
      }
      applyRemoval(auditId)
    } catch {
      setRowError(auditId, 'Action failed, please try again')
    } finally {
      setPendingActions((prev) => { const next = new Set(prev); next.delete(auditId); return next })
    }
  }

  return { rowErrors, pendingActions, detailEntry, setDetailEntry, loadingDetail, handleRowClick, handleAction }
}

function useChangeReview() {
  const [data, setData] = React.useState<ChangeReviewResponse | null>(null)
  const [error, setError] = React.useState(false)
  const [refreshError, setRefreshError] = React.useState(false)
  const [tableFilter, setTableFilter] = React.useState('')
  const [operationFilter, setOperationFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('pending')
  const [page, setPage] = React.useState(1)
  const [refreshKey, setRefreshKey] = React.useState(0)
  // Caches the latest filters so the background refresh effect can reuse them
  // without adding filter/page state to its dependency array.
  const latestFilters = React.useRef<ListFilters | null>(null)
  const actions = useRowActions(setData, setRefreshKey)

  React.useEffect(() => {
    if (data?.entries.length === 0 && page > 1) setPage((p) => p - 1)
  }, [data, page])

  // Hard reload: clears data and resets error state when filters or page change.
  React.useEffect(() => {
    const controller = new AbortController()
    const filters: ListFilters = { tableFilter, operationFilter, statusFilter, page }
    latestFilters.current = filters
    setError(false)
    setRefreshError(false)
    setData(null)
    fetchChangeReview(filters, controller.signal, setData, () => setError(true))
    return () => controller.abort()
  }, [tableFilter, operationFilter, statusFilter, page])

  // Background refresh: triggered after a successful action via refreshKey.
  // Does not clear data — keeps the optimistic state visible if the fetch fails.
  React.useEffect(() => {
    if (refreshKey === 0) return
    const filters = latestFilters.current
    if (!filters) return
    const controller = new AbortController()
    setRefreshError(false)
    fetchChangeReview(filters, controller.signal, setData, () => setRefreshError(true))
    return () => controller.abort()
  }, [refreshKey])

  return {
    data, error, refreshError, page, setPage,
    tableFilter, setTableFilter,
    operationFilter, setOperationFilter,
    statusFilter, setStatusFilter,
    ...actions,
  }
}

interface ChangeReviewFiltersProps {
  tableFilter: string
  operationFilter: string
  statusFilter: string
  onTableChange: (v: string) => void
  onOperationChange: (v: string) => void
  onStatusChange: (v: string) => void
}

function ChangeReviewFilters({ tableFilter, operationFilter, statusFilter, onTableChange, onOperationChange, onStatusChange }: Readonly<ChangeReviewFiltersProps>) {
  return (
    <div className="flex gap-2 mb-4">
      <NativeSelect aria-label="Table" value={tableFilter} onChange={(e) => onTableChange(e.target.value)}>
        <option value="">All tables</option>
        {TABLE_NAMES.map((t) => (
          <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Operation" value={operationFilter} onChange={(e) => onOperationChange(e.target.value)}>
        <option value="">All operations</option>
        <option value="CREATE">Create</option>
        <option value="UPDATE">Update</option>
        <option value="DELETE">Delete</option>
      </NativeSelect>
      <NativeSelect aria-label="Status" value={statusFilter} onChange={(e) => onStatusChange(e.target.value)}>
        <option value="pending">Pending</option>
        <option value="acknowledged">Reviewed</option>
        <option value="undone">Undone</option>
        <option value="all">All</option>
      </NativeSelect>
    </div>
  )
}

interface PaginationControlsProps {
  page: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
}

function PaginationControls({ page, totalPages, onPrev, onNext }: Readonly<PaginationControlsProps>) {
  return (
    <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
      <button onClick={onPrev} disabled={page <= 1} className="px-2 py-1 border border-border rounded disabled:opacity-40">Previous</button>
      <span>Page {page} of {totalPages}</span>
      <button onClick={onNext} disabled={page >= totalPages} className="px-2 py-1 border border-border rounded disabled:opacity-40">Next</button>
    </div>
  )
}

interface ChangeReviewContentProps {
  data: ChangeReviewResponse | null
  loadingDetail: string | null
  rowErrors: Record<string, string>
  pendingActions: Set<string>
  isAdmin: boolean
  selectedIds: Set<string>
  onRowClick: (id: string) => void
  onAction: (auditId: string, action: EntryAction) => Promise<void>
  onToggle: (id: string) => void
  onShiftToggle: (id: string, allIds: string[]) => void
  onSelectAll: (ids: string[]) => void
}

function ChangeReviewContent({
  data, loadingDetail, rowErrors, pendingActions,
  isAdmin, selectedIds, onRowClick, onAction, onToggle, onShiftToggle, onSelectAll,
}: Readonly<ChangeReviewContentProps>) {
  if (!data) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  return (
    <ChangeReviewTable
      data={data}
      loadingDetail={loadingDetail}
      rowErrors={rowErrors}
      pendingActions={pendingActions}
      isAdmin={isAdmin}
      selectedIds={selectedIds}
      onRowClick={onRowClick}
      onAction={onAction}
      onToggle={onToggle}
      onShiftToggle={onShiftToggle}
      onSelectAll={onSelectAll}
    />
  )
}

export default function ChangeReviewPage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const {
    data, error, refreshError, page, setPage,
    tableFilter, setTableFilter,
    operationFilter, setOperationFilter,
    statusFilter, setStatusFilter,
    rowErrors, pendingActions,
    detailEntry, setDetailEntry,
    loadingDetail, handleRowClick, handleAction,
  } = useChangeReview()
  const {
    selectedIds, bulkAction, bulkError,
    toggle, shiftToggle, selectAll,
    openBulkAction, closeBulkAction,
    confirmBulk,
  } = useChangeReviewBulk()
  const showBulkBar = isAdmin && selectedIds.size > 0

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Could not load change review entries.
        </div>
      </div>
    )
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="px-6 py-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">Change Review</h2>
      {refreshError && (
        <p className="text-xs text-amber-600 mb-2">Could not refresh — showing last known data.</p>
      )}
      {bulkError && (
        <p className="text-xs text-destructive mb-2">Bulk action failed — please try again.</p>
      )}
      <ChangeReviewFilters
        tableFilter={tableFilter}
        operationFilter={operationFilter}
        statusFilter={statusFilter}
        onTableChange={(v) => { setTableFilter(v); setPage(1) }}
        onOperationChange={(v) => { setOperationFilter(v); setPage(1) }}
        onStatusChange={(v) => { setStatusFilter(v); setPage(1) }}
      />
      {showBulkBar && (
        <ChangeReviewBulkBar
          selectedCount={selectedIds.size}
          bulkAction={bulkAction}
          onBulkApprove={() => openBulkAction('approve')}
          onBulkReject={() => openBulkAction('reject')}
          onConfirm={() => { void confirmBulk() }}
          onCancelBulk={closeBulkAction}
        />
      )}
      <ChangeReviewContent
        data={data}
        loadingDetail={loadingDetail}
        rowErrors={rowErrors}
        pendingActions={pendingActions}
        isAdmin={isAdmin}
        selectedIds={selectedIds}
        onRowClick={(id) => { void handleRowClick(id) }}
        onAction={handleAction}
        onToggle={toggle}
        onShiftToggle={shiftToggle}
        onSelectAll={selectAll}
      />
      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      />
      {detailEntry && <DiffModal entry={detailEntry} onClose={() => setDetailEntry(null)} />}
    </div>
  )
}
