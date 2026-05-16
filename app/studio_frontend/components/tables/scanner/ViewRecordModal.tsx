'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { MatchMeta, ScanResult } from '@/lib/types'

interface ViewRecordModalProps {
  result: ScanResult
  onClose: () => void
  onAcknowledge?: (resultId: string) => void
  onSaved?: () => void
}

function VersionEntry({ result, match }: Readonly<{ result: ScanResult; match: MatchMeta | null }>) {
  if (result.status === 'conflicted') {
    return (
      <div>
        <dt className="text-xs text-muted-foreground">Version</dt>
        <dd className="flex gap-4 text-xs">
          <span>Disk: <span className="font-mono text-foreground">{result.version}</span></span>
          <span>Catalog: <span className="font-mono text-amber-500">{match?.record_version ?? '—'}</span></span>
        </dd>
      </div>
    )
  }
  return (
    <div>
      <dt className="text-xs text-muted-foreground">Version</dt>
      <dd className="text-foreground">{match?.record_version ?? result.version}</dd>
    </div>
  )
}

function ModalActions({ result, onAcknowledge, onClose }: Readonly<{
  result: ScanResult
  onAcknowledge?: (resultId: string) => void
  onClose: () => void
}>) {
  return (
    <div className="flex justify-between items-center pt-4">
      <div>
        {(result.status === 'known' || result.status === 'matched') && !result.confirmed_at && onAcknowledge && (
          <button
            onClick={() => onAcknowledge(result.result_id)}
            className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
            data-testid="view-record-acknowledge-button"
          >
            Acknowledge
          </button>
        )}
      </div>
      <button
        onClick={onClose}
        className="rounded border border-border px-3 py-1.5 text-sm"
        data-testid="view-record-close-button"
      >
        Close
      </button>
    </div>
  )
}

export function ViewRecordModal({ result, onClose, onAcknowledge, onSaved: _ }: Readonly<ViewRecordModalProps>) {
  const { match } = result
  const isConfirmed = !!result.confirmed_at

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="view-record-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Catalog Record
            {isConfirmed && (
              <span
                className="text-xs font-normal text-green-600 bg-green-500/10 rounded px-2 py-0.5"
                data-testid="view-record-confirmed-badge"
              >
                Confirmed
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <dl className="space-y-3 pt-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Table</dt>
            <dd className="font-mono text-foreground">{match?.record_table ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Name</dt>
            <dd className="text-foreground">{match?.record_name ?? result.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Vendor</dt>
            <dd className="text-foreground">{match?.record_vendor ?? result.vendor}</dd>
          </div>
          <VersionEntry result={result} match={match} />
          <div>
            <dt className="text-xs text-muted-foreground">Record ID</dt>
            <dd className="font-mono text-xs text-muted-foreground break-all">{match?.record_id ?? '—'}</dd>
          </div>
        </dl>

        <ModalActions result={result} onAcknowledge={onAcknowledge} onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}
