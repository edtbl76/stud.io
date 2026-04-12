'use client'

import * as React from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { DiffModal } from '@/components/DiffModal'
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

function buildListUrl(
  tableFilter: string,
  operationFilter: string,
  statusFilter: string,
  page: number,
): string {
  const params = new URLSearchParams()
  if (tableFilter) params.set('table', tableFilter)
  if (operationFilter) params.set('operation', operationFilter)
  params.set('status', statusFilter)
  params.set('page', String(page))
  params.set('page_size', String(PAGE_SIZE))
  return `/api/admin/change-review?${params}`
}

function fetchChangeReview(
  url: string,
  signal: AbortSignal,
  onSuccess: (data: ChangeReviewResponse) => void,
  onError: () => void,
): void {
  void fetch(url, { signal })
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
  auditId: string,
): ChangeReviewResponse | null {
  return prev
    ? { ...prev, entries: prev.entries.filter((e) => e.audit_id !== auditId), total: prev.total - 1 }
    : prev
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

  async function handleAction(auditId: string, method: 'POST' | 'DELETE', urlSuffix: string) {
    setPendingActions((prev) => new Set(prev).add(auditId))
    try {
      const res = await fetch(`/api/admin/change-review/${auditId}/${urlSuffix}`, { method })
      if (res.status === 204) {
        setData((prev) => removeEntry(prev, auditId))
        setRefreshKey((k) => k + 1)
        return
      }
      const body = await res.json()
      if (!res.ok) {
        setRowError(auditId, (body as { detail?: string })?.detail ?? 'Action failed, please try again')
        return
      }
      setData((prev) => removeEntry(prev, auditId))
      setRefreshKey((k) => k + 1)
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
  // Caches the last fetched URL so the background refresh effect can reuse it
  // without adding filter/page state to its dependency array.
  const queryUrl = React.useRef('')
  const actions = useRowActions(setData, setRefreshKey)

  React.useEffect(() => {
    if (data?.entries.length === 0 && page > 1) setPage((p) => p - 1)
  }, [data, page])

  // Hard reload: clears data and resets error state when filters or page change.
  React.useEffect(() => {
    const controller = new AbortController()
    setError(false)
    setData(null)
    const url = buildListUrl(tableFilter, operationFilter, statusFilter, page)
    queryUrl.current = url
    fetchChangeReview(url, controller.signal, setData, () => setError(true))
    return () => controller.abort()
  }, [tableFilter, operationFilter, statusFilter, page])

  // Background refresh: triggered after a successful action via refreshKey.
  // Does not clear data — keeps the optimistic state visible if the fetch fails.
  React.useEffect(() => {
    if (refreshKey === 0) return
    const url = queryUrl.current
    if (!url) return
    const controller = new AbortController()
    setRefreshError(false)
    fetchChangeReview(url, controller.signal, setData, () => setRefreshError(true))
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

  function renderActionsCell(entry: AuditEntry) {
    const rowError = rowErrors[entry.audit_id]
    if (rowError) return <span className="text-destructive">{rowError}</span>

    const isResolved = !!(entry.acknowledged_at || entry.undone_at)
    if (isResolved) {
      return <span className="text-muted-foreground italic">{entry.acknowledged_at ? 'Acknowledged' : 'Undone'}</span>
    }

    if (!isAdmin) return null

    return (
      <div className="flex gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); void handleAction(entry.audit_id, 'POST', 'undo') }}
          disabled={pendingActions.has(entry.audit_id)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Undo
        </button>
        {entry.operation === 'DELETE' ? (
          <button
            onClick={(e) => { e.stopPropagation(); void handleAction(entry.audit_id, 'DELETE', 'permanent') }}
            disabled={pendingActions.has(entry.audit_id)}
            className="text-destructive hover:text-destructive/80 transition-colors"
          >
            Permanently Delete
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); void handleAction(entry.audit_id, 'POST', 'acknowledge') }}
            disabled={pendingActions.has(entry.audit_id)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Acknowledge
          </button>
        )}
      </div>
    )
  }

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

      <div className="flex gap-2 mb-4">
        <select
          aria-label="Table"
          value={tableFilter}
          onChange={(e) => { setTableFilter(e.target.value); setPage(1) }}
          className="text-xs border border-border rounded px-2 py-1 bg-background"
        >
          <option value="">All tables</option>
          {TABLE_NAMES.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>

        <select
          aria-label="Operation"
          value={operationFilter}
          onChange={(e) => { setOperationFilter(e.target.value); setPage(1) }}
          className="text-xs border border-border rounded px-2 py-1 bg-background"
        >
          <option value="">All operations</option>
          <option value="CREATE">Create</option>
          <option value="UPDATE">Update</option>
          <option value="DELETE">Delete</option>
        </select>

        <select
          aria-label="Status"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="text-xs border border-border rounded px-2 py-1 bg-background"
        >
          <option value="pending">Pending</option>
          <option value="acknowledged">Reviewed</option>
          <option value="undone">Undone</option>
          <option value="all">All</option>
        </select>
      </div>

      {!data && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
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
                  onClick={() => void handleRowClick(entry.audit_id)}
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
                  <td className="py-1.5" onClick={(e) => e.stopPropagation()}>{renderActionsCell(entry)}</td>
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
      )}

      <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-2 py-1 border border-border rounded disabled:opacity-40"
        >
          Previous
        </button>
        <span>Page {page} of {totalPages}</span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="px-2 py-1 border border-border rounded disabled:opacity-40"
        >
          Next
        </button>
      </div>

      {detailEntry && <DiffModal entry={detailEntry} onClose={() => setDetailEntry(null)} />}
    </div>
  )
}
