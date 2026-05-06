'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ScanResult } from '@/lib/types'

interface ViewRecordModalProps {
  result: ScanResult
  onClose: () => void
}

export function ViewRecordModal({ result, onClose }: Readonly<ViewRecordModalProps>) {
  const { match } = result

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="view-record-modal">
        <DialogHeader>
          <DialogTitle>Catalog Record</DialogTitle>
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
          <div>
            <dt className="text-xs text-muted-foreground">Version</dt>
            <dd className="text-foreground">{match?.record_version ?? result.version}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Record ID</dt>
            <dd className="font-mono text-xs text-muted-foreground break-all">{match?.record_id ?? '—'}</dd>
          </div>
        </dl>

        <div className="flex justify-end pt-4">
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-sm"
            data-testid="view-record-close-button"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
