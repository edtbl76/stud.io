import type { NeedsReviewSubState, WorkbenchRow } from '@/lib/types'

// U-20 Bulk Confirmation: a display-only view-model computed from the current
// selection. It never drives execution — the existing bulk handlers re-derive
// their own eligible set — so the confirmed count provably matches what runs.

export type BulkActionKind = 'exclude' | 'reject' | 'bulk-update'

export interface ConfirmationRequest {
  kind: BulkActionKind
  selectedCount: number
  affectedCount: number
  skippedCount: number
  skipReason: string | null
  destructive: boolean
}

const SKIP_REASONS: Record<BulkActionKind, string | null> = {
  exclude: null,
  reject: 'not in a rejectable state',
  'bulk-update': 'no version mismatch',
}

const SUMMARY_VERBS: Record<Exclude<BulkActionKind, 'exclude'>, string> = {
  reject: 'Reject',
  'bulk-update': 'Update',
}

// Each predicate is copied verbatim from the handler it fronts (BR-U20-05).
function isAffected(
  kind: BulkActionKind,
  row: WorkbenchRow,
  rowSubStates: Map<string, NeedsReviewSubState>,
): boolean {
  if (kind === 'exclude') return true
  if (kind === 'reject') return row.bucket === 'needs_review' || row.bucket === 'known'
  return rowSubStates.get(row.result_id) === 'mismatch'
}

export function buildRequest(
  kind: BulkActionKind,
  selectedRows: WorkbenchRow[],
  rowSubStates: Map<string, NeedsReviewSubState>,
): ConfirmationRequest {
  const selectedCount = selectedRows.length
  const affectedCount = selectedRows.filter((row) => isAffected(kind, row, rowSubStates)).length
  const skippedCount = selectedCount - affectedCount
  return {
    kind,
    selectedCount,
    affectedCount,
    skippedCount,
    skipReason: skippedCount > 0 ? SKIP_REASONS[kind] : null,
    destructive: kind !== 'bulk-update',
  }
}

export function summaryLine(request: ConfirmationRequest): string {
  if (request.kind === 'exclude') return `Exclude ${request.affectedCount} entries?`
  const verb = SUMMARY_VERBS[request.kind]
  const head = `${verb} ${request.affectedCount} of ${request.selectedCount} selected?`
  if (request.skippedCount === 0 || request.skipReason === null) return head
  return `${head} (${request.skippedCount} skipped: ${request.skipReason}.)`
}
