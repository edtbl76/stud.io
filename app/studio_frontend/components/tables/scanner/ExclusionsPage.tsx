'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { Exclusion } from '@/lib/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function ExclusionsPage() {
  const [exclusions, setExclusions] = useState<Exclusion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const fetchExclusions = useCallback(() => {
    setLoading(true)
    api.scanner.exclusions()
      .then(data => setExclusions(data))
      .catch(() => setError('Failed to load exclusions'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchExclusions() }, [fetchExclusions])

  const handleConfirmRemove = useCallback(async () => {
    if (!pendingRemoveId) return
    try {
      await api.scanner.removeExclusion(pendingRemoveId)
      setPendingRemoveId(null)
      fetchExclusions()
    } catch {
      setRemoveError('Failed to remove exclusion')
    }
  }, [pendingRemoveId, fetchExclusions])

  if (loading) {
    return <div data-testid="exclusions-loading" className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
  }

  if (error) {
    return <div data-testid="exclusions-error" className="p-4 text-destructive">{error}</div>
  }

  if (exclusions.length === 0) {
    return <div data-testid="exclusions-empty-state" className="py-12 text-center text-sm text-muted-foreground">No exclusions found.</div>
  }

  return (
    <div className="overflow-x-auto">
      {removeError && (
        <div data-testid="exclusion-remove-error" className="mb-4 rounded border border-destructive p-3 text-sm text-destructive">{removeError}</div>
      )}
      {pendingRemoveId && (
        <div data-testid="exclusion-remove-confirm" className="mb-4 flex items-center gap-3 rounded border border-destructive p-3 text-sm">
          <span>Remove this exclusion?</span>
          <button
            data-testid="exclusion-remove-confirm-ok"
            onClick={handleConfirmRemove}
            className="rounded bg-destructive px-3 py-1 text-destructive-foreground"
          >
            Remove
          </button>
          <button
            data-testid="exclusion-remove-confirm-cancel"
            onClick={() => setPendingRemoveId(null)}
            className="rounded border px-3 py-1"
          >
            Cancel
          </button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-2">Vendor</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Format</th>
            <th className="px-3 py-2">Excluded By</th>
            <th className="px-3 py-2">Excluded At</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {exclusions.map(ex => (
            <tr key={ex.exclusion_id} data-testid="exclusion-row" className="border-b hover:bg-muted/50">
              <td className="px-3 py-2">{ex.vendor}</td>
              <td className="px-3 py-2">{ex.name}</td>
              <td className="px-3 py-2">{ex.format ?? '—'}</td>
              <td className="px-3 py-2">{ex.excluded_by ?? '—'}</td>
              <td className="px-3 py-2">{formatDate(ex.excluded_at)}</td>
              <td className="px-3 py-2">
                <button
                  data-testid={`exclusion-remove-${ex.exclusion_id}`}
                  onClick={() => setPendingRemoveId(ex.exclusion_id)}
                  className="text-destructive hover:underline"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
