'use client'

import * as React from 'react'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScannerModalContent } from '../modals/ScannerModalContent'
import { summaryLine, type BulkActionKind, type ConfirmationRequest } from '@/lib/bulkConfirmation'

interface BulkConfirmDialogProps {
  request: ConfirmationRequest | null
  onConfirm: () => void
  onCancel: () => void
}

const TITLES: Record<BulkActionKind, string> = {
  exclude: 'Exclude Entries',
  reject: 'Reject Matches',
  'bulk-update': 'Update Records',
}

const CONFIRM_LABELS: Record<BulkActionKind, string> = {
  exclude: 'Exclude',
  reject: 'Reject',
  'bulk-update': 'Update',
}

const CANCEL_CLASS = 'border rounded px-3 py-1 text-sm'
const DESTRUCTIVE_CLASS = 'bg-destructive text-destructive-foreground rounded px-3 py-1 text-sm disabled:opacity-50'
const NEUTRAL_CLASS = 'bg-primary text-primary-foreground rounded px-3 py-1 text-sm disabled:opacity-50'

export function BulkConfirmDialog({ request, onConfirm, onCancel }: Readonly<BulkConfirmDialogProps>) {
  const cancelRef = React.useRef<HTMLButtonElement>(null)

  function handleOpenAutoFocus(event: Event) {
    // Irreversible actions land focus on Cancel so a stray Enter cannot fire them (BR-U20-07).
    if (request?.destructive) {
      event.preventDefault()
      cancelRef.current?.focus()
    }
  }

  return (
    <Dialog open={request !== null} onOpenChange={(next) => { if (!next) onCancel() }}>
      {request && (
        <ScannerModalContent
          data-testid="bulk-confirm-dialog"
          className="max-w-md"
          onOpenAutoFocus={handleOpenAutoFocus}
        >
          <DialogHeader>
            <DialogTitle>{TITLES[request.kind]}</DialogTitle>
            <DialogDescription>{summaryLine(request)}</DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <button
              ref={cancelRef}
              data-testid="bulk-confirm-cancel"
              type="button"
              onClick={onCancel}
              className={CANCEL_CLASS}
            >
              Cancel
            </button>
            <button
              data-testid="bulk-confirm-submit"
              type="button"
              onClick={onConfirm}
              disabled={request.affectedCount === 0}
              className={request.destructive ? DESTRUCTIVE_CLASS : NEUTRAL_CLASS}
            >
              {CONFIRM_LABELS[request.kind]}
            </button>
          </DialogFooter>
        </ScannerModalContent>
      )}
    </Dialog>
  )
}
