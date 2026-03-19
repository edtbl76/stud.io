'use client'

import * as React from 'react'
import { Loader2, AlertCircle, X } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { computeDiff, formatDiffValue } from '@/lib/computeDiff'

interface AuditEntry {
  audit_id: string
  table_name: string
  record_id: string
  operation: string
  performed_by: string
  performed_at: string
  acknowledged_at: string | null
  acknowledged_by: string | null
  undone_at: string | null
  undone_by: string | null
  record_display_name: string | null
}

interface AuditEntryWithData extends AuditEntry {
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

interface ChangeReviewResponse {
  total: number
  page: number
  page_size: number
  entries: AuditEntry[]
}

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

// ---------------------------------------------------------------------------
// Diff modal
// ---------------------------------------------------------------------------

interface DiffModalProps {
  readonly entry: AuditEntryWithData
  readonly onClose: () => void
}

function DiffModal({ entry, onClose }: DiffModalProps) {
  const title = entry.record_display_name ?? entry.record_id.slice(0, 8)
  let body: React.ReactNode

  if (entry.operation === 'UPDATE' && entry.old_data && entry.new_data) {
    const changes = computeDiff(entry.old_data, entry.new_data)
    if (changes.length === 0) {
      body = <p className="text-xs text-muted-foreground">No field changes recorded.</p>
    } else {
      body = (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="py-1.5 pr-4 font-medium w-1/4">Field</th>
              <th className="py-1.5 pr-4 font-medium w-[37.5%]">Before</th>
              <th className="py-1.5 font-medium w-[37.5%]">After</th>
            </tr>
          </thead>
          <tbody>
            {changes.map(({ field, from, to }) => (
              <tr key={field} className="border-b border-border/50">
                <td className="py-1.5 pr-4 font-mono text-muted-foreground">{field}</td>
                <td className="py-1.5 pr-4 text-destructive/80">{formatDiffValue(from)}</td>
                <td className="py-1.5 text-green-600 dark:text-green-400">{formatDiffValue(to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
  } else if (entry.operation === 'CREATE' && entry.new_data) {
    body = (
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="py-1.5 pr-4 font-medium w-1/3">Field</th>
            <th className="py-1.5 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(entry.new_data).map(([field, val]) => (
            <tr key={field} className="border-b border-border/50">
              <td className="py-1.5 pr-4 font-mono text-muted-foreground">{field}</td>
              <td className="py-1.5">{formatDiffValue(val)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  } else if (entry.operation === 'DELETE' && entry.old_data) {
    body = (
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="py-1.5 pr-4 font-medium w-1/3">Field</th>
            <th className="py-1.5 font-medium">Value at deletion</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(entry.old_data).map(([field, val]) => (
            <tr key={field} className="border-b border-border/50">
              <td className="py-1.5 pr-4 font-mono text-muted-foreground">{field}</td>
              <td className="py-1.5 text-muted-foreground">{formatDiffValue(val)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  } else {
    body = <p className="text-xs text-muted-foreground">No data available for this entry.</p>
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
      />
      <dialog
        open
        className="relative m-0 border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4 bg-background text-foreground p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <span className="font-semibold text-sm">{title}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {entry.operation} · {entry.table_name} · {timeAgo(entry.performed_at)} by {entry.performed_by}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Body */}
        <div className="overflow-y-auto px-4 py-3 flex-1">
          {body}
        </div>
      </dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ChangeReviewPage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [data, setData] = React.useState<ChangeReviewResponse | null>(null)
  const [error, setError] = React.useState(false)
  const [tableFilter, setTableFilter] = React.useState('')
  const [operationFilter, setOperationFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('pending')
  const [page, setPage] = React.useState(1)
  const [rowErrors, setRowErrors] = React.useState<Record<string, string>>({})
  const [pendingActions, setPendingActions] = React.useState<Set<string>>(new Set())
  const [detailEntry, setDetailEntry] = React.useState<AuditEntryWithData | null>(null)
  const [loadingDetail, setLoadingDetail] = React.useState<string | null>(null)
  const errorTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Cleanup all pending error timers on unmount
  React.useEffect(() => {
    return () => {
      Object.values(errorTimers.current).forEach(clearTimeout)
    }
  }, [])

  // When all entries on a page are resolved/removed, go back to previous page
  React.useEffect(() => {
    if (data?.entries.length === 0 && page > 1) {
      setPage((p) => p - 1)
    }
  }, [data, page])

  React.useEffect(() => {
    const controller = new AbortController()
    setError(false)
    setData(null)
    const params = new URLSearchParams()
    if (tableFilter) params.set('table', tableFilter)
    if (operationFilter) params.set('operation', operationFilter)
    params.set('status', statusFilter)
    params.set('page', String(page))
    params.set('page_size', String(PAGE_SIZE))

    fetch(`/api/admin/change-review?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load')
        return res.json() as Promise<ChangeReviewResponse>
      })
      .then(setData)
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return
        setError(true)
      })
    return () => controller.abort()
  }, [tableFilter, operationFilter, statusFilter, page])

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

  async function handleAction(
    auditId: string,
    method: 'POST' | 'DELETE',
    urlSuffix: string,
  ) {
    setPendingActions((prev) => new Set(prev).add(auditId))
    try {
      const res = await fetch(`/api/admin/change-review/${auditId}/${urlSuffix}`, {
        method,
      })
      if (res.status === 204) {
        setData((prev) =>
          prev
            ? { ...prev, entries: prev.entries.filter((e) => e.audit_id !== auditId), total: prev.total - 1 }
            : prev
        )
        return
      }
      const body = await res.json()
      if (!res.ok) {
        const msg = (body as { detail?: string })?.detail ?? 'Action failed, please try again'
        setRowError(auditId, msg)
        return
      }
      setData((prev) =>
        prev
          ? { ...prev, entries: prev.entries.filter((e) => e.audit_id !== auditId), total: prev.total - 1 }
          : prev
      )
    } catch {
      setRowError(auditId, 'Action failed, please try again')
    } finally {
      setPendingActions((prev) => {
        const next = new Set(prev)
        next.delete(auditId)
        return next
      })
    }
  }

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          Could not load change review entries.
        </div>
      </div>
    )
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="px-6 py-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">Change Review</h2>

      {/* Filter bar */}
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

      {/* Loading spinner */}
      {!data && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Table */}
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
              {data.entries.map((entry) => {
                const isResolved = !!(entry.acknowledged_at || entry.undone_at)
                const rowError = rowErrors[entry.audit_id]
                const isLoadingRow = loadingDetail === entry.audit_id
                let actionsCell: React.ReactNode
                if (rowError) {
                  actionsCell = <span className="text-destructive">{rowError}</span>
                } else if (isResolved) {
                  actionsCell = (
                    <span className="text-muted-foreground italic">
                      {entry.acknowledged_at ? 'Acknowledged' : 'Undone'}
                    </span>
                  )
                } else if (isAdmin) {
                  const isDelete = entry.operation === 'DELETE'
                  actionsCell = (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); void handleAction(entry.audit_id, 'POST', 'undo') }}
                        disabled={pendingActions.has(entry.audit_id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Undo
                      </button>
                      {isDelete ? (
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
                } else {
                  actionsCell = null
                }
                return (
                  <tr
                    key={entry.audit_id}
                    className="border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => void handleRowClick(entry.audit_id)}
                  >
                    <td className="py-1.5 pr-4 text-muted-foreground">
                      {timeAgo(entry.performed_at)}
                    </td>
                    <td className="py-1.5 pr-4">{entry.table_name}</td>
                    <td className="py-1.5 pr-4 font-mono text-muted-foreground">
                      {isLoadingRow ? (
                        <Loader2 className="h-3 w-3 animate-spin inline" />
                      ) : (
                        entry.record_display_name ?? entry.record_id.slice(0, 8)
                      )}
                    </td>
                    <td className="py-1.5 pr-4">{entry.operation}</td>
                    <td className="py-1.5 pr-4 text-muted-foreground">{entry.performed_by}</td>
                    <td className="py-1.5" onClick={(e) => e.stopPropagation()}>{actionsCell}</td>
                  </tr>
                )
              })}
              {data.entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
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

      {/* Diff modal */}
      {detailEntry && (
        <DiffModal entry={detailEntry} onClose={() => setDetailEntry(null)} />
      )}
    </div>
  )
}
