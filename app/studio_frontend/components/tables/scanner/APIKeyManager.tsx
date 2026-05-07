'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ScannerApiKeyResponse } from '@/lib/types'
import { NewKeyModal } from './NewKeyModal'
import type { NewKeyResult } from './NewKeyModal'
import { RevokeConfirmModal } from './RevokeConfirmModal'
import type { ScannerApiKey } from './RevokeConfirmModal'

const isActiveKey = (k: { revoked_at: string | null }) => k.revoked_at === null

function toScannerApiKey(r: ScannerApiKeyResponse): ScannerApiKey {
  return {
    key_id: r.key_id,
    label: r.label,
    key_hint: r.key_hint,
    created_at: r.created_at,
    revoked_at: r.revoked_at,
  }
}

function defaultLabel(): string {
  return `key-${new Date().toISOString().slice(0, 10)}`
}

export function APIKeyManager() {
  const queryClient = useQueryClient()
  const [showRevoked, setShowRevoked] = React.useState(false)
  const [label, setLabel] = React.useState(defaultLabel)
  const [newKey, setNewKey] = React.useState<NewKeyResult | null>(null)
  const [revokeTarget, setRevokeTarget] = React.useState<ScannerApiKey | null>(null)

  const { data: keys = [], isError, error } = useQuery({
    queryKey: ['scanner', 'keys'],
    queryFn: api.scanner.listKeys,
  })

  React.useEffect(() => {
    if (isError) toast.error(`Failed to load API keys: ${error instanceof Error ? error.message : 'unknown error'}`)
  }, [isError, error])

  const generateMutation = useMutation({
    mutationFn: (lbl: string) => api.scanner.createKey(lbl),
    onError: () => toast.error('Failed to generate API key. Please try again.'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['scanner', 'keys'] })
      setLabel(defaultLabel())
      setNewKey(result)
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => api.scanner.revokeKey(keyId),
    onError: () => toast.error('Failed to revoke key. Please try again.'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanner', 'keys'] })
      setRevokeTarget(null)
    },
  })

  const visibleKeys = showRevoked ? keys : keys.filter(isActiveKey)

  return (
    <section className="space-y-4" data-testid="api-key-manager">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label htmlFor="key-label-input" className="text-xs text-muted-foreground">
            Key label (optional)
          </label>
          <input
            id="key-label-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="key-YYYY-MM-DD"
            className="w-full rounded border border-border bg-muted px-3 py-1.5 text-sm text-foreground"
            data-testid="key-label-input"
          />
        </div>
        <button
          onClick={() => generateMutation.mutate(label || defaultLabel())}
          disabled={generateMutation.isPending}
          className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
          data-testid="generate-key-button"
        >
          {generateMutation.isPending ? 'Generating...' : 'Generate API Key'}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {keys.filter(isActiveKey).length} active key{keys.filter(isActiveKey).length === 1 ? '' : 's'}
        </p>
        <button
          onClick={() => setShowRevoked(v => !v)}
          className="text-xs text-muted-foreground underline"
          data-testid="show-revoked-toggle"
        >
          {showRevoked ? 'Hide revoked' : 'Show revoked'}
        </button>
      </div>

      <div className="divide-y divide-border/50 rounded border border-border" data-testid="key-list">
        {visibleKeys.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground" data-testid="key-list-empty">
            No keys yet.
          </p>
        ) : (
          visibleKeys.map(k => (
            <KeyRow
              key={k.key_id}
              apiKey={toScannerApiKey(k)}
              onRevoke={setRevokeTarget}
            />
          ))
        )}
      </div>

      {newKey && <NewKeyModal result={newKey} onClose={() => setNewKey(null)} />}
      {revokeTarget && (
        <RevokeConfirmModal
          apiKey={revokeTarget}
          isPending={revokeMutation.isPending}
          onConfirm={() => revokeMutation.mutate(revokeTarget.key_id)}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </section>
  )
}

function KeyRow({
  apiKey, onRevoke,
}: Readonly<{ apiKey: ScannerApiKey; onRevoke: (k: ScannerApiKey) => void }>) {
  const isRevoked = apiKey.revoked_at !== null
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 text-sm ${isRevoked ? 'opacity-50' : ''}`}
      data-testid={`key-row-${apiKey.key_id}`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{apiKey.label}</p>
        <p className="text-xs text-muted-foreground font-mono">····{apiKey.key_hint}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isRevoked ? (
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">Revoked</span>
        ) : (
          <button
            onClick={() => onRevoke(apiKey)}
            className="rounded border border-destructive/50 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
            aria-label={`Revoke ${apiKey.label}`}
            data-testid={`revoke-button-${apiKey.key_id}`}
          >
            Revoke
          </button>
        )}
      </div>
    </div>
  )
}
