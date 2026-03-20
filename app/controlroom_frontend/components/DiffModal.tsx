'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { computeDiff, formatDiffValue } from '@/lib/computeDiff'
import type { AuditEntryWithData } from '@/lib/types'

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

interface Props {
  readonly entry: AuditEntryWithData
  readonly onClose: () => void
}

function DiffBody({ entry }: { readonly entry: AuditEntryWithData }) {
  if (entry.operation === 'UPDATE' && entry.old_data && entry.new_data) {
    const changes = computeDiff(entry.old_data, entry.new_data)
    if (changes.length === 0) {
      return <p className="text-xs text-muted-foreground">No field changes recorded.</p>
    }
    return (
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

  const data = entry.operation === 'CREATE' ? entry.new_data : entry.old_data
  if (!data) {
    return <p className="text-xs text-muted-foreground">No data available for this entry.</p>
  }

  const valueClass = entry.operation === 'DELETE' ? 'text-muted-foreground' : ''
  const colHeader = entry.operation === 'DELETE' ? 'Value at deletion' : 'Value'

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-muted-foreground text-left">
          <th className="py-1.5 pr-4 font-medium w-1/3">Field</th>
          <th className="py-1.5 font-medium">{colHeader}</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(data).map(([field, val]) => (
          <tr key={field} className="border-b border-border/50">
            <td className="py-1.5 pr-4 font-mono text-muted-foreground">{field}</td>
            <td className={`py-1.5 ${valueClass}`}>{formatDiffValue(val)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function DiffModal({ entry, onClose }: Props) {
  const title = entry.record_display_name ?? entry.record_id.slice(0, 8)

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
        <div className="overflow-y-auto px-4 py-3 flex-1">
          <DiffBody entry={entry} />
        </div>
      </dialog>
    </div>
  )
}
