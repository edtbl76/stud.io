'use client'

import * as React from 'react'
import type { ScanRun } from '@/lib/types'

const PURGE_OPTIONS = [
  { label: 'Keep last 30 days',  value: 30 },
  { label: 'Keep last 90 days',  value: 90 },
  { label: 'Keep last 180 days', value: 180 },
  { label: 'Clear all',          value: 'all' as const },
] as const

type PurgeValue = 30 | 90 | 180 | 'all'

interface ScanRunPickerProps {
  runs: ScanRun[]
  selectedId: string | null
  onChange: (scanId: string) => void
  onPurge: (olderThanDays: PurgeValue) => Promise<void>
}

export function ScanRunPicker({ runs, selectedId, onChange, onPurge }: Readonly<ScanRunPickerProps>) {
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [purgeValue, setPurgeValue] = React.useState<PurgeValue>(30)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [purging, setPurging] = React.useState(false)

  async function handlePurge() {
    setPurging(true)
    try {
      await onPurge(purgeValue)
    } finally {
      setPurging(false)
      setConfirmOpen(false)
      setHistoryOpen(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label htmlFor="scan-run-select" className="text-xs text-muted-foreground shrink-0">
          Scan run:
        </label>
        <select
          id="scan-run-select"
          value={selectedId ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded border border-border bg-muted px-2 py-1 text-xs text-foreground"
          data-testid="scan-run-select"
        >
          {runs.map((run) => (
            <option key={run.scan_id} value={run.scan_id}>
              {new Date(run.scanned_at).toLocaleString()} — {run.status_counts.matched}M {run.status_counts.unconfirmed}U {run.status_counts.untracked}T {run.status_counts.orphaned}O
            </option>
          ))}
        </select>
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          className="text-xs text-muted-foreground underline shrink-0"
          data-testid="manage-history-toggle"
        >
          Manage History
        </button>
      </div>

      {historyOpen && (
        <div className="rounded border border-border bg-card p-3 space-y-3" data-testid="manage-history-panel">
          <p className="text-xs font-medium text-foreground">Purge scan history</p>
          <div className="flex flex-wrap gap-2">
            {PURGE_OPTIONS.map((opt) => (
              <label key={String(opt.value)} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="purge-option"
                  value={String(opt.value)}
                  checked={purgeValue === opt.value}
                  onChange={() => setPurgeValue(opt.value as PurgeValue)}
                  data-testid={`purge-option-${opt.value}`}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <button
            onClick={() => setConfirmOpen(true)}
            className="rounded bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
            data-testid="purge-button"
          >
            Purge
          </button>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border border-border bg-card p-6 shadow-lg w-80 space-y-4">
            <p className="text-sm font-medium text-foreground">Confirm purge</p>
            <p className="text-xs text-muted-foreground">
              This will permanently delete scan runs
              {purgeValue === 'all' ? ' — all of them' : ` older than ${purgeValue} days`}.
              This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded border border-border px-3 py-1.5 text-xs"
                data-testid="purge-cancel-button"
              >
                Cancel
              </button>
              <button
                onClick={handlePurge}
                disabled={purging}
                className="rounded bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-50"
                data-testid="purge-confirm-button"
              >
                {purging ? 'Purging...' : 'Confirm Purge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
