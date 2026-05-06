'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export interface ScannerApiKey {
  key_id: string
  label: string
  key_hint: string
  created_at: string
  revoked_at: string | null
}

interface RevokeConfirmModalProps {
  apiKey: ScannerApiKey
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function RevokeConfirmModal({
  apiKey, isPending, onConfirm, onCancel,
}: Readonly<RevokeConfirmModalProps>) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent data-testid="revoke-confirm-modal">
        <DialogTitle>Revoke API Key</DialogTitle>
        <DialogDescription>
          Revoking <span className="font-medium text-foreground">{apiKey.label}</span> is
          permanent and cannot be undone. Any scanner binary using this key will receive
          a 401 error on its next scan.
        </DialogDescription>

        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onCancel}
            className="rounded border border-border px-3 py-1.5 text-sm"
            data-testid="revoke-cancel-button"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="rounded bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            data-testid="revoke-confirm-button"
          >
            {isPending ? 'Revoking...' : 'Revoke Key'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
