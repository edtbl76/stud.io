'use client'

import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScannerModalContent } from './ScannerModalContent'

export const HARD_RESET_CONFIRMATION = 'RESET ALL SCANNER DATA'

interface HardResetDialogProps {
  isOpen: boolean
  confirmText: string
  isSubmitting: boolean
  onConfirmTextChange: (text: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export function HardResetDialog({
  isOpen,
  confirmText,
  isSubmitting,
  onConfirmTextChange,
  onConfirm,
  onCancel,
}: Readonly<HardResetDialogProps>) {
  return (
    <Dialog open={isOpen} onOpenChange={(next) => { if (!next) onCancel() }}>
      <ScannerModalContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hard Reset</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4">
          <p className="text-sm text-muted-foreground mb-4">
            Type <strong>{HARD_RESET_CONFIRMATION}</strong> to confirm.
          </p>
          <input
            type="text"
            aria-label={`Type ${HARD_RESET_CONFIRMATION} to confirm`}
            value={confirmText}
            onChange={(e) => onConfirmTextChange(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </div>

        <DialogFooter>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmText !== HARD_RESET_CONFIRMATION || isSubmitting}
          >
            Confirm
          </button>
        </DialogFooter>
      </ScannerModalContent>
    </Dialog>
  )
}
