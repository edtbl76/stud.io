'use client'

import * as React from 'react'
import { Loader2, AlertCircle, RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { computeDiff, formatDiffValue } from '@/lib/computeDiff'

interface AuditEntryWithData {
  audit_id: string
  table_name: string
  record_id: string
  operation: string
  performed_by: string
  performed_at: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  acknowledged_at: string | null
  acknowledged_by: string | null
  undone_at: string | null
  undone_by: string | null
}

interface RecordHistoryViewProps {
  historyUrl: string
  isAdmin: boolean
  onUndo: () => void
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString()
}

function OperationBadge({ op }: Readonly<{ op: string }>) {
  const colors: Record<string, string> = {
    CREATE: 'bg-green-100 text-green-800',
    UPDATE: 'bg-blue-100 text-blue-800',
    DELETE: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${colors[op] ?? 'bg-muted text-muted-foreground'}`}>
      {op}
    </span>
  )
}

function DiffTable({ oldData, newData }: Readonly<{ oldData: Record<string, unknown>; newData: Record<string, unknown> }>) {
  const changes = computeDiff(oldData, newData)
  if (changes.length === 0) return <p className="text-xs text-muted-foreground">No field changes detected</p>
  return (
    <table className="w-full text-xs border-collapse">
      <tbody>
        {changes.map(({ field, from, to }) => (
          <tr key={field} className="border-b border-border last:border-0">
            <td className="py-1 pr-2 font-mono text-muted-foreground w-1/3">{field}</td>
            <td className="py-1 pr-2 line-through text-destructive/70">{formatDiffValue(from)}</td>
            <td className="py-1 text-foreground">{formatDiffValue(to)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function RecordHistoryView({ historyUrl, isAdmin, onUndo }: Readonly<RecordHistoryViewProps>) {
  const [entries, setEntries] = React.useState<AuditEntryWithData[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [undoingId, setUndoingId] = React.useState<string | null>(null)

  React.useEffect(() => {
    api.list<AuditEntryWithData>(historyUrl)
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load history'))
  }, [historyUrl])

  if (error) {
    return (
      <div data-testid="history-view-content" className="flex items-center gap-2 text-sm text-destructive">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    )
  }

  if (entries === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading history...
      </div>
    )
  }

  if (entries.length === 0) {
    return <p data-testid="history-view-content" className="text-sm text-muted-foreground">No history available</p>
  }

  async function handleUndo(auditId: string) {
    setUndoingId(auditId)
    try {
      await api.create(`/admin/change-review/${auditId}/undo`, {})
      onUndo()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undo failed')
      setUndoingId(null)
    }
  }

  return (
    <div data-testid="history-view-content" className="space-y-4">
      {entries.map((entry) => {
        const canUndo = isAdmin && entry.undone_at === null && entry.acknowledged_at === null
        const isUndoing = undoingId === entry.audit_id

        return (
          <div key={entry.audit_id} className="rounded border border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <OperationBadge op={entry.operation} />
                <span className="text-muted-foreground">{formatTs(entry.performed_at)}</span>
                <span className="font-medium">{entry.performed_by}</span>
              </div>
              <div className="flex items-center gap-2">
                {entry.undone_at !== null && (
                  <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">Undone</span>
                )}
                {entry.acknowledged_at !== null && entry.undone_at === null && (
                  <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">Acknowledged</span>
                )}
                {canUndo && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUndo(entry.audit_id)}
                    disabled={isUndoing}
                  >
                    {isUndoing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    Undo
                  </Button>
                )}
              </div>
            </div>

            <div className="pl-1">
              {entry.operation === 'CREATE' && (
                <p className="text-xs text-muted-foreground">Record created</p>
              )}
              {entry.operation === 'DELETE' && (
                <p className="text-xs text-muted-foreground">Record deleted</p>
              )}
              {entry.operation === 'UPDATE' && entry.old_data !== null && entry.new_data !== null && (
                <DiffTable oldData={entry.old_data} newData={entry.new_data} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
