'use client'

import * as React from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { DiffModal } from '@/components/DiffModal'
import { NativeSelect } from '@/components/ui/NativeSelect'
import type { AuditEntry, AuditEntryWithData, ChangeReviewResponse } from '@/lib/types'

const TABLE_NAMES = [
  'brands', 'models',
  'effects', 'instruments', 'libraries', 'workstations',
  'admin_tools', 'composition_tools', 'measurement_tools',
  'reference_tools', 'workflow_tools',
  'effect_types', 'entity_types', 'instrument_types',
  'model_types', 'plugin_formats', 'tag_types', 'tool_types',
] as const

const PAGE_SIZE = 50

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

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
  return `/api/admin/change-review?${params}`
}

interface EntryAction {
  method: 'POST' | 'DELETE'
  path: string
}

const ENTRY_ACTIONS = {
  undo:        { method: 'POST',   path: 'undo' },
  acknowledge: { method: 'POST',   path: 'acknowledge' },
  permanent:   { method: 'DELETE', path: 'permanent' },
} as const satisfies Record<string, EntryAction>

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
      const res = await fetch(`/api/admin/change-review/${auditId}`)
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
      const res = await fetch(`/api/admin/change-review/${auditId}/${action.path}`, { method: action.method })
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

interface EntryActionButtonsProps {
  entry: AuditEntry
  isPending: boolean
  onAction: (e: React.MouseEvent, action: EntryAction) => void
}

interface EntryActionsCellProps {
  entry: AuditEntry
  rowError: string | undefined
  isPending: boolean
  isAdmin: boolean
  onAction: (auditId: string, action: EntryAction) => Promise<void>
}

function EntryActionButtons({ entry, isPending, onAction }: Readonly<EntryActionButtonsProps>) {
  return (
    <div className="flex gap-2 items-center">
      <button
        onClick={(e) => onAction(e, ENTRY_ACTIONS.undo)}
        disabled={isPending}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        Undo
      </button>
      {entry.operation === 'DELETE' ? (
        <button
          onClick={(e) => onAction(e, ENTRY_ACTIONS.permanent)}
          disabled={isPending}
          className="flex items-center gap-1 text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Permanently Delete
        </button>
      ) : (
        <button
          onClick={(e) => onAction(e, ENTRY_ACTIONS.acknowledge)}
          disabled={isPending}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Acknowledge
        </button>
      )}
    </div>
  )
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

interface ChangeReviewTableProps {
  data: ChangeReviewResponse
  loadingDetail: string | null
  rowErrors: Record<string, string>
  pendingActions: Set<string>
  isAdmin: boolean
  onRowClick: (auditId: string) => void
  onAction: (auditId: string, action: EntryAction) => Promise<void>
}

function ChangeReviewTable({ data, loadingDetail, rowErrors, pendingActions, isAdmin, onRowClick, onAction }: Readonly<ChangeReviewTableProps>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">Table</th>
            <th className="py-2 pr-4 font-medium">Record</th>
            <th className="py-2 pr-4 font-medium">Op</th>
            <th className="py-2 pr-4 font-medium">By</th>
            <th className="py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((entry) => (
            <tr
              key={entry.audit_id}
              className="border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => onRowClick(entry.audit_id)}
            >
              <td className="py-1.5 pr-4 text-muted-foreground">{timeAgo(entry.performed_at)}</td>
              <td className="py-1.5 pr-4">{entry.table_name}</td>
              <td className="py-1.5 pr-4 font-mono text-muted-foreground">
                {loadingDetail === entry.audit_id ? (
                  <Loader2 className="h-3 w-3 animate-spin inline" />
                ) : (
                  entry.record_display_name ?? entry.record_id.slice(0, 8)
                )}
              </td>
              <td className="py-1.5 pr-4">{entry.operation}</td>
              <td className="py-1.5 pr-4 text-muted-foreground">{entry.performed_by}</td>
              <td className="py-1.5" onClick={(e) => e.stopPropagation()}>
                <EntryActionsCell
                  entry={entry}
                  rowError={rowErrors[entry.audit_id]}
                  isPending={pendingActions.has(entry.audit_id)}
                  isAdmin={isAdmin}
                  onAction={onAction}
                />
              </td>
            </tr>
          ))}
          {data.entries.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-muted-foreground">No entries found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function EntryActionsCell({ entry, rowError, isPending, isAdmin, onAction }: Readonly<EntryActionsCellProps>) {
  if (rowError) return <span className="text-destructive">{rowError}</span>
  const isResolved = !!(entry.acknowledged_at || entry.undone_at)
  if (isResolved) {
    return <span className="text-muted-foreground italic">{entry.acknowledged_at ? 'Acknowledged' : 'Undone'}</span>
  }
  if (!isAdmin) return null
  return (
    <EntryActionButtons
      entry={entry}
      isPending={isPending}
      onAction={(e, action) => { e.stopPropagation(); void onAction(entry.audit_id, action) }}
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
      <ChangeReviewFilters
        tableFilter={tableFilter}
        operationFilter={operationFilter}
        statusFilter={statusFilter}
        onTableChange={(v) => { setTableFilter(v); setPage(1) }}
        onOperationChange={(v) => { setOperationFilter(v); setPage(1) }}
        onStatusChange={(v) => { setStatusFilter(v); setPage(1) }}
      />
      {!data && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {data && (
        <ChangeReviewTable
          data={data}
          loadingDetail={loadingDetail}
          rowErrors={rowErrors}
          pendingActions={pendingActions}
          isAdmin={isAdmin}
          onRowClick={(id) => { void handleRowClick(id) }}
          onAction={handleAction}
        />
      )}
      <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-2 py-1 border border-border rounded disabled:opacity-40">Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2 py-1 border border-border rounded disabled:opacity-40">Next</button>
      </div>
      {detailEntry && <DiffModal entry={detailEntry} onClose={() => setDetailEntry(null)} />}
    </div>
  )
}
