'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export interface NewKeyResult {
  key_id: string
  label: string
  key: string
  key_hint: string
}

interface NewKeyModalProps {
  result: NewKeyResult
  onClose: () => void
}

export function NewKeyModal({ result, onClose }: Readonly<NewKeyModalProps>) {
  const [copied, setCopied] = React.useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result.key)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        data-testid="new-key-modal"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle>API Key Generated</DialogTitle>
        <DialogDescription className="text-destructive font-medium">
          This key will not be shown again. Copy it now and store it securely.
        </DialogDescription>

        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={result.key}
              className="flex-1 rounded border border-border bg-muted px-3 py-2 text-xs font-mono text-foreground"
              data-testid="new-key-value"
            />
            <button
              onClick={handleCopy}
              className="rounded border border-border px-3 py-2 text-xs hover:bg-muted shrink-0"
              data-testid="copy-key-button"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            Label: <span className="font-medium text-foreground">{result.label}</span>
            {' · '}Hint: <span className="font-mono">····{result.key_hint}</span>
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            data-testid="confirm-copied-button"
          >
            I&apos;ve copied this key
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
