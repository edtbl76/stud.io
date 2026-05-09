'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export function ExclusionsSection() {
  const queryClient = useQueryClient()
  const [confirmId, setConfirmId] = React.useState<string | null>(null)

  const { data: exclusions = [], isError, error } = useQuery({
    queryKey: ['scanner', 'exclusions'],
    queryFn: api.scanner.exclusions,
  })

  const removeMutation = useMutation({
    mutationFn: (exclusionId: string) => api.scanner.removeExclusion(exclusionId),
    onError: () => toast.error('Failed to remove exclusion. Please try again.'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanner', 'exclusions'] })
      setConfirmId(null)
    },
  })

  if (isError) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-destructive" data-testid="exclusions-error-state">
        Failed to load exclusions: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  if (exclusions.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground" data-testid="exclusions-empty-state">
        No plugins excluded.
      </div>
    )
  }

  return (
    <>
      <div className="divide-y divide-border/50" data-testid="exclusions-list">
        {exclusions.map((ex) => (
          <div key={ex.exclusion_id} className="flex items-center gap-4 px-4 py-3 text-sm" data-testid={`exclusion-row-${ex.exclusion_id}`}>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{ex.name}</p>
              <p className="text-xs text-muted-foreground">{ex.vendor} · excluded {new Date(ex.excluded_at).toLocaleDateString()}</p>
            </div>
            <button
              onClick={() => setConfirmId(ex.exclusion_id)}
              className="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted shrink-0"
              aria-label={`Remove ${ex.name} from exclusion list`}
              data-testid={`remove-exclusion-button-${ex.exclusion_id}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <Dialog open={!!confirmId} onOpenChange={(open) => { if (!open) setConfirmId(null) }}>
        <DialogContent className="w-80 max-w-[calc(100vw-2rem)] p-6 space-y-4">
          <DialogTitle className="text-sm font-medium text-foreground">Remove from exclusion list?</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            This plugin will appear in future scan reports again.
          </DialogDescription>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setConfirmId(null)}
              className="rounded border border-border px-3 py-1.5 text-xs"
              data-testid="exclusion-cancel-button"
            >
              Cancel
            </button>
            <button
              onClick={() => confirmId && removeMutation.mutate(confirmId)}
              disabled={removeMutation.isPending}
              className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              data-testid="exclusion-confirm-remove-button"
            >
              Remove
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
