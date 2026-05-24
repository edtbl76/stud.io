'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import type { AuditEntry, ChangeReviewResponse } from '@/lib/types'

export interface EntryAction {
  method: 'POST' | 'DELETE'
  path: string
}

export const ENTRY_ACTIONS = {
  undo:        { method: 'POST',   path: 'undo' } as EntryAction,
  acknowledge: { method: 'POST',   path: 'acknowledge' } as EntryAction,
  permanent:   { method: 'DELETE', path: 'permanent' } as EntryAction,
}

export function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
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

export interface ChangeReviewTableProps {
  data: ChangeReviewResponse
  loadingDetail: string | null
  rowErrors: Record<string, string>
  pendingActions: Set<string>
  isAdmin: boolean
  selectedIds: Set<string>
  onRowClick: (auditId: string) => void
  onAction: (auditId: string, action: EntryAction) => Promise<void>
  onToggle: (id: string, shiftKey: boolean) => void
  onSelectAll: (ids: string[]) => void
}

function EntryActionButtons({ entry, isPending, onAction }: Readonly<EntryActionButtonsProps>) {
  return (
    <div className="flex gap-2">
      <button onClick={(e) => onAction(e, ENTRY_ACTIONS.undo)} disabled={isPending} className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
        Undo
      </button>
      {entry.operation === 'DELETE' ? (
        <button onClick={(e) => onAction(e, ENTRY_ACTIONS.permanent)} disabled={isPending} className="text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50">
          Permanently Delete
        </button>
      ) : (
        <button onClick={(e) => onAction(e, ENTRY_ACTIONS.acknowledge)} disabled={isPending} className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
          Acknowledge
        </button>
      )}
    </div>
  )
}

function EntryActionsCell({ entry, rowError, isPending, isAdmin, onAction }: Readonly<EntryActionsCellProps>) {
  if (rowError) return <span className="text-destructive">{rowError}</span>
  const isResolved = !!(entry.acknowledged_at || entry.undone_at)
  if (isResolved) return <span className="text-muted-foreground italic">{entry.acknowledged_at ? 'Acknowledged' : 'Undone'}</span>
  if (!isAdmin) return null
  return (
    <EntryActionButtons entry={entry} isPending={isPending} onAction={(e, action) => { e.stopPropagation(); void onAction(entry.audit_id, action) }} />
  )
}

export function ChangeReviewTable({ data, loadingDetail, rowErrors, pendingActions, isAdmin, selectedIds, onRowClick, onAction, onToggle, onSelectAll }: Readonly<ChangeReviewTableProps>) {
  const allIds = data.entries.map((e) => e.audit_id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="py-2 pr-2">
              <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => allSelected ? onSelectAll([]) : onSelectAll(allIds)} />
            </th>
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
            <tr key={entry.audit_id} className="border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors" tabIndex={0} aria-label={`View details for ${entry.record_display_name ?? entry.record_id.slice(0, 8)}`} onClick={() => onRowClick(entry.audit_id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(entry.audit_id) } }}>
              <td className="py-1.5 pr-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={selectedIds.has(entry.audit_id)} onChange={(e) => onToggle(entry.audit_id, (e.nativeEvent as MouseEvent).shiftKey)} />
              </td>
              <td className="py-1.5 pr-4 text-muted-foreground">{timeAgo(entry.performed_at)}</td>
              <td className="py-1.5 pr-4">{entry.table_name}</td>
              <td className="py-1.5 pr-4 font-mono text-muted-foreground">{loadingDetail === entry.audit_id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : (entry.record_display_name ?? entry.record_id.slice(0, 8))}</td>
              <td className="py-1.5 pr-4">{entry.operation}</td>
              <td className="py-1.5 pr-4 text-muted-foreground">{entry.performed_by}</td>
              <td className="py-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <EntryActionsCell entry={entry} rowError={rowErrors[entry.audit_id]} isPending={pendingActions.has(entry.audit_id)} isAdmin={isAdmin} onAction={onAction} />
              </td>
            </tr>
          ))}
          {data.entries.length === 0 && (
            <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No entries found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
