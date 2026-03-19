'use client'

import * as React from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth'

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
  const errorTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Cleanup all pending error timers on unmount
  React.useEffect(() => {
    return () => {
      Object.values(errorTimers.current).forEach(clearTimeout)
    }
  }, [])

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
    // Clear any existing timer for this row before setting a new one
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
        const msg = body?.detail ?? 'Action failed, please try again'
        setRowError(auditId, msg)
        return
      }
      // Successful POST: remove from list (optimistic)
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
                  actionsCell = (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(entry.audit_id, 'POST', 'undo')}
                            disabled={pendingActions.has(entry.audit_id)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Undo
                          </button>
                          <button
                            onClick={() => handleAction(entry.audit_id, 'POST', 'acknowledge')}
                            disabled={pendingActions.has(entry.audit_id)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Acknowledge
                          </button>
                          {entry.operation === 'DELETE' && (
                            <button
                              onClick={() => handleAction(entry.audit_id, 'DELETE', 'permanent')}
                              disabled={pendingActions.has(entry.audit_id)}
                              className="text-destructive hover:text-destructive/80 transition-colors"
                            >
                              Permanently Delete
                            </button>
                          )}
                        </div>
                  )
                } else {
                  actionsCell = null
                }
                return (
                  <tr key={entry.audit_id} className="border-b border-border/50">
                    <td className="py-1.5 pr-4 text-muted-foreground">
                      {timeAgo(entry.performed_at)}
                    </td>
                    <td className="py-1.5 pr-4">{entry.table_name}</td>
                    <td className="py-1.5 pr-4 font-mono text-muted-foreground">
                      {entry.record_display_name ?? entry.record_id.slice(0, 8)}
                    </td>
                    <td className="py-1.5 pr-4">{entry.operation}</td>
                    <td className="py-1.5 pr-4 text-muted-foreground">{entry.performed_by}</td>
                    <td className="py-1.5">{actionsCell}</td>
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
    </div>
  )
}
