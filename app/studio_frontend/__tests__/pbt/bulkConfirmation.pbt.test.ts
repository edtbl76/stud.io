import * as fc from 'fast-check'
import { buildRequest, type BulkActionKind } from '@/lib/bulkConfirmation'
import type { NeedsReviewSubState, WorkbenchRow } from '@/lib/types'

// ── Strategies ──────────────────────────────────────────────────────────────

const bucketArb = fc.constantFrom<WorkbenchRow['bucket']>(
  'unlinked', 'orphaned', 'needs_review', 'known', 'excluded', 'collision',
)
const subStateArb = fc.constantFrom<NeedsReviewSubState>('mismatch', 'unconfirmed')
const kindArb = fc.constantFrom<BulkActionKind>('exclude', 'reject', 'bulk-update')

// A row plus an optional substate, keyed by a unique index-derived result_id.
const rowSpecArb = fc.record({
  bucket: bucketArb,
  sub: fc.option(subStateArb, { nil: null }),
})

function build(specs: Array<{ bucket: WorkbenchRow['bucket']; sub: NeedsReviewSubState | null }>) {
  const rows: WorkbenchRow[] = specs.map((s, i) => ({
    result_id: `r${i}`, disk_name: 'X', disk_vendor: 'Y', disk_version: '1', disk_format: 'VST3',
    disk_path: '/p', display_name: 'X', display_vendor: 'Y',
    catalog_record_id: null, catalog_record_table: null, catalog_record_name: null,
    catalog_record_vendor: null, catalog_record_version: null,
    bucket: s.bucket, confidence: null, confirmed_at: null, confirmed_by: null,
  }))
  const subStates = new Map<string, NeedsReviewSubState>()
  specs.forEach((s, i) => { if (s.sub) subStates.set(`r${i}`, s.sub) })
  return { rows, subStates }
}

describe('buildRequest — properties', () => {
  it('affectedCount + skippedCount always equals selectedCount', () => {
    fc.assert(fc.property(kindArb, fc.array(rowSpecArb), (kind, specs) => {
      const { rows, subStates } = build(specs)
      const req = buildRequest(kind, rows, subStates)
      expect(req.affectedCount + req.skippedCount).toBe(req.selectedCount)
      expect(req.selectedCount).toBe(rows.length)
    }))
  })

  it('skipReason is non-null exactly when rows are skipped (except exclude, which never skips)', () => {
    fc.assert(fc.property(kindArb, fc.array(rowSpecArb), (kind, specs) => {
      const { rows, subStates } = build(specs)
      const req = buildRequest(kind, rows, subStates)
      expect(req.skipReason === null).toBe(req.skippedCount === 0)
    }))
  })

  it('exclude affects every row: skippedCount 0 and skipReason null', () => {
    fc.assert(fc.property(fc.array(rowSpecArb), (specs) => {
      const { rows, subStates } = build(specs)
      const req = buildRequest('exclude', rows, subStates)
      expect(req.affectedCount).toBe(rows.length)
      expect(req.skippedCount).toBe(0)
      expect(req.skipReason).toBeNull()
    }))
  })

  it('destructive is true for every kind except bulk-update', () => {
    fc.assert(fc.property(kindArb, fc.array(rowSpecArb), (kind, specs) => {
      const { rows, subStates } = build(specs)
      const req = buildRequest(kind, rows, subStates)
      expect(req.destructive).toBe(kind !== 'bulk-update')
    }))
  })
})
