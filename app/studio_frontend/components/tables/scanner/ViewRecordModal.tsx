'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FieldRow } from '@/components/FieldRow'
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
      <FieldRow
        label="Version"
        value={
          <span className="flex gap-4 text-xs">
            <span>Disk: <span className="font-mono text-foreground">{result.version}</span></span>
            <span>Catalog: <span className="font-mono text-amber-500">{match?.record_version ?? '—'}</span></span>
          </span>
        }
      />
    )
  }
  return <FieldRow label="Version" value={match?.record_version ?? result.version} />
}

function ModalActions({ result, onAcknowledge, onClose }: Readonly<{
  result: ScanResult
  onAcknowledge?: (resultId: string) => void
  onClose: () => void
}>) {
  const showAcknowledge = (result.status === 'known' || result.status === 'matched') && !result.confirmed_at && !!onAcknowledge
  return (
    <>
      {showAcknowledge && (
        <div className="mr-auto">
          <Button
            variant="success"
            onClick={() => onAcknowledge(result.result_id)}
            data-testid="view-record-acknowledge-button"
          >
            Acknowledge
          </Button>
        </div>
      )}
      <Button variant="ghost" size="sm" onClick={onClose} data-testid="view-record-close-button">
        Close
      </Button>
    </>
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

        <div className="px-6 py-4 space-y-4">
          <FieldRow label="Table" value={<span className="font-mono">{match?.record_table ?? '—'}</span>} />
          <FieldRow label="Name" value={match?.record_name ?? result.name} />
          <FieldRow label="Vendor" value={match?.record_vendor ?? result.vendor} />
          <VersionEntry result={result} match={match} />
          <FieldRow label="Record ID" value={<span className="font-mono text-xs break-all">{match?.record_id ?? '—'}</span>} />
        </div>

        <DialogFooter>
          <ModalActions result={result} onAcknowledge={onAcknowledge} onClose={onClose} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
