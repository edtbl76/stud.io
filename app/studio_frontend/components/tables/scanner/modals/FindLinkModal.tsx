'use client'

import { useFindLink } from '@/lib/useFindLink'
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScannerModalContent } from './ScannerModalContent'
import type { WorkbenchRow } from '@/lib/types'

type Mode = 'unlinked-to-orphaned' | 'orphaned-to-unlinked'

interface FindLinkModalProps {
  mode: Mode
  sourceId: string
  onClose: () => void
  onLinked: () => void
}

function getCandidateName(candidate: WorkbenchRow): string {
  return candidate.display_name
}

export function FindLinkModal({ mode, sourceId, onClose, onLinked }: Readonly<FindLinkModalProps>) {
  const { candidates, isLoading, query, setQuery, selectedIds, toggleCandidate, confirmLink, isSubmitting } =
    useFindLink(mode, sourceId)

  const rows = candidates as WorkbenchRow[]

  const confirmLabel =
    mode === 'orphaned-to-unlinked' && selectedIds.size > 0
      ? `Link ${selectedIds.size} entries`
      : 'Link'

  async function handleConfirm() {
    await confirmLink()
    onLinked()
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <ScannerModalContent>
        <DialogHeader>
          <DialogTitle>Find Link</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4">
      <label className="sr-only" htmlFor="find-link-search">Search</label>
      <input
        id="find-link-search"
        aria-label="Search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        className="w-full border rounded px-2 py-1 text-sm mb-3"
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="divide-y divide-border max-h-64 overflow-y-auto">
          {rows.map((c) => (
            <li key={c.result_id} className="flex items-center gap-2 py-2 px-1">
              <input
                type="checkbox"
                checked={selectedIds.has(c.result_id)}
                onChange={() => toggleCandidate(c.result_id)}
              />
              <span className="text-sm">{getCandidateName(c)}</span>
            </li>
          ))}
        </ul>
      )}

        </div>

        <DialogFooter>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selectedIds.size === 0 || isSubmitting}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </ScannerModalContent>
    </Dialog>
  )
}
