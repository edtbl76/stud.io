import { buildRequest, summaryLine } from '@/lib/bulkConfirmation'
import type { NeedsReviewSubState, WorkbenchRow } from '@/lib/types'

function makeRow(overrides: Partial<WorkbenchRow> = {}): WorkbenchRow {
  return {
    result_id: 'r1', disk_name: 'X', disk_vendor: 'Y', disk_version: '1', disk_format: 'VST3',
    disk_path: '/p', display_name: 'X', display_vendor: 'Y',
    catalog_record_id: null, catalog_record_table: null, catalog_record_name: null,
    catalog_record_vendor: null, catalog_record_version: null,
    bucket: 'unlinked', confidence: null, confirmed_at: null, confirmed_by: null,
    ...overrides,
  }
}

const noSubStates = new Map<string, NeedsReviewSubState>()

// ── Step 9: exclude affects every selected row ──────────────────────────────
it('buildRequest(exclude) affects all selected rows, skips none, is destructive', () => {
  const rows = [makeRow({ result_id: 'a', bucket: 'unlinked' }), makeRow({ result_id: 'b', bucket: 'known' })]
  const req = buildRequest('exclude', rows, noSubStates)
  expect(req).toEqual({
    kind: 'exclude', selectedCount: 2, affectedCount: 2,
    skippedCount: 0, skipReason: null, destructive: true,
  })
})

// ── Step 10: reject affects only needs_review / known ───────────────────────
it('buildRequest(reject) affects only needs_review/known rows with a skip reason, destructive', () => {
  const rows = [
    makeRow({ result_id: 'a', bucket: 'needs_review' }),
    makeRow({ result_id: 'b', bucket: 'known' }),
    makeRow({ result_id: 'c', bucket: 'unlinked' }),
  ]
  const req = buildRequest('reject', rows, noSubStates)
  expect(req.affectedCount).toBe(2)
  expect(req.skippedCount).toBe(1)
  expect(req.skipReason).toBe('not in a rejectable state')
  expect(req.destructive).toBe(true)
})

// ── Step 11: bulk-update affects only mismatch substate, neutral ────────────
it('buildRequest(bulk-update) affects only mismatch rows with a skip reason, not destructive', () => {
  const rows = [
    makeRow({ result_id: 'a', bucket: 'needs_review' }),
    makeRow({ result_id: 'b', bucket: 'needs_review' }),
  ]
  const subStates = new Map<string, NeedsReviewSubState>([['a', 'mismatch'], ['b', 'unconfirmed']])
  const req = buildRequest('bulk-update', rows, subStates)
  expect(req.affectedCount).toBe(1)
  expect(req.skippedCount).toBe(1)
  expect(req.skipReason).toBe('no version mismatch')
  expect(req.destructive).toBe(false)
})

// ── Step 12: no skip reason when nothing is skipped ─────────────────────────
it('buildRequest sets skipReason null when every selected row is affected', () => {
  const rows = [makeRow({ result_id: 'a', bucket: 'needs_review' }), makeRow({ result_id: 'b', bucket: 'known' })]
  const req = buildRequest('reject', rows, noSubStates)
  expect(req.skippedCount).toBe(0)
  expect(req.skipReason).toBeNull()
})

// ── Step 13: exclude summary line ───────────────────────────────────────────
it('summaryLine(exclude) reads "Exclude N entries?" with no skip clause', () => {
  const req = buildRequest('exclude', [makeRow(), makeRow({ result_id: 'b' })], noSubStates)
  expect(summaryLine(req)).toBe('Exclude 2 entries?')
})

// ── Step 14: reject / bulk-update summary lines with and without skips ───────
it('summaryLine(reject) reads "Reject A of S selected? (K skipped: reason.)" when rows are skipped', () => {
  const rows = [
    makeRow({ result_id: 'a', bucket: 'needs_review' }),
    makeRow({ result_id: 'b', bucket: 'unlinked' }),
    makeRow({ result_id: 'c', bucket: 'orphaned' }),
  ]
  const req = buildRequest('reject', rows, noSubStates)
  expect(summaryLine(req)).toBe('Reject 1 of 3 selected? (2 skipped: not in a rejectable state.)')
})

it('summaryLine(bulk-update) omits the skip clause when nothing is skipped', () => {
  const rows = [makeRow({ result_id: 'a', bucket: 'needs_review' })]
  const subStates = new Map<string, NeedsReviewSubState>([['a', 'mismatch']])
  const req = buildRequest('bulk-update', rows, subStates)
  expect(summaryLine(req)).toBe('Update 1 of 1 selected?')
})
