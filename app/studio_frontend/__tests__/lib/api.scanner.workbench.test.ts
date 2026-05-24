import { api } from '../../lib/api'
import type {
  WorkbenchBucket,
  WorkbenchRow,
  OrphanedRecord,
  WorkbenchResponse,
  WorkbenchServerParams,
  NeedsReviewSubState,
  WorkbenchClientFilters,
  FindLinkCandidatesResponse,
  CreateLinkRequest,
  BulkCreateLinkRequest,
  BulkLinkResult,
  SoftResetResult,
  HardResetRequest,
  HardResetResult,
  SelectionState,
  FieldSource,
  SingleResolutionInput,
  FieldChoice,
  CollisionResolutionInput,
  BulkAcknowledgeRequest,
  BulkAcknowledgeResult,
  BulkUndoRequest,
  BulkUndoResult,
} from '../../lib/types'

function mockFetch(body?: unknown, status = 200) {
  const mock = jest.fn().mockResolvedValue({
    ok: status < 400, status, statusText: 'OK',
    json: async () => body ?? {},
  } as Response)
  global.fetch = mock
  return mock
}

afterEach(() => jest.restoreAllMocks())

const BASE = '/api'

// ---------------------------------------------------------------------------
// Steps 1-3: type shape assertions (compile-time — runtime is a sanity check)
// ---------------------------------------------------------------------------

// Step 1
describe('WorkbenchBucket / WorkbenchRow / OrphanedRecord / WorkbenchResponse types', () => {
  it('WorkbenchRow is assignable with required fields', () => {
    const row: WorkbenchRow = {
      result_id: 'r1',
      disk_name: 'Surge XT',
      disk_vendor: 'MNTRA',
      disk_version: '1.0',
      disk_format: 'VST3',
      disk_path: '/path/to/plugin',
      display_name: 'Surge XT',
      display_vendor: 'MNTRA',
      catalog_record_id: null,
      catalog_record_table: null,
      catalog_record_name: null,
      catalog_record_vendor: null,
      catalog_record_version: null,
      bucket: 'unlinked' as WorkbenchBucket,
      confidence: null,
      confirmed_at: null,
      confirmed_by: null,
    }
    expect(row.result_id).toBe('r1')
  })

  it('OrphanedRecord is assignable with required fields', () => {
    const rec: OrphanedRecord = {
      catalog_record_id: 'c1',
      catalog_record_table: 'effects',
      name: 'Surge XT',
      vendor: null,
      version: null,
      disk_paths: [],
    }
    expect(rec.catalog_record_id).toBe('c1')
  })

  it('WorkbenchResponse is assignable', () => {
    const resp: WorkbenchResponse = { rows: [], orphaned: [], scan_id: null }
    expect(resp.rows).toHaveLength(0)
  })
})

// Step 2
describe('WorkbenchServerParams / WorkbenchClientFilters / NeedsReviewSubState types', () => {
  it('WorkbenchServerParams is assignable', () => {
    const params: WorkbenchServerParams = { show_confirmed: true }
    expect(params.show_confirmed).toBe(true)
  })

  it('WorkbenchClientFilters is assignable', () => {
    const filters: WorkbenchClientFilters = {
      bucket: '',
      needs_review_substate: '',
      catalog_type: '',
      format: '',
    }
    expect(filters.bucket).toBe('')
  })

  it('NeedsReviewSubState union is assignable', () => {
    const s1: NeedsReviewSubState = 'collision'
    const s2: NeedsReviewSubState = 'version mismatch'
    const s3: NeedsReviewSubState = 'unconfirmed'
    expect([s1, s2, s3]).toHaveLength(3)
  })
})

// Step 3
describe('remaining workbench types', () => {
  it('CreateLinkRequest / BulkCreateLinkRequest / BulkLinkResult are assignable', () => {
    const single: CreateLinkRequest = { result_id: 'r', catalog_record_id: 'c', catalog_record_table: 'effects' }
    const bulk: BulkCreateLinkRequest = { result_ids: ['r'], catalog_record_id: 'c', catalog_record_table: 'effects' }
    const result: BulkLinkResult = { links_created: 1 }
    expect(single.result_id).toBe('r')
    expect(bulk.result_ids).toHaveLength(1)
    expect(result.links_created).toBe(1)
  })

  it('FindLinkCandidatesResponse is assignable', () => {
    const resp: FindLinkCandidatesResponse = { type: 'unlinked', candidates: [], total: 0 }
    expect(resp.total).toBe(0)
  })

  it('SoftResetResult / HardResetRequest / HardResetResult are assignable', () => {
    const soft: SoftResetResult = { type: 'soft', rules_disabled: 3 }
    const req: HardResetRequest = { confirmation_text: 'RESET ALL SCANNER DATA' }
    const hard: HardResetResult = { type: 'hard', records_wiped: 100, seeded_rules_restored: 1 }
    expect(soft.rules_disabled).toBe(3)
    expect(req.confirmation_text).toBe('RESET ALL SCANNER DATA')
    expect(hard.records_wiped).toBe(100)
  })

  it('SelectionState / FieldSource / SingleResolutionInput / FieldChoice / CollisionResolutionInput are assignable', () => {
    const sel: SelectionState = { selectedIds: new Set(['r1']), lastClickedIndex: null }
    const src: FieldSource = 'disk'
    const single: SingleResolutionInput = { nameSource: 'disk', vendorSource: 'catalog', versionSource: 'disk' }
    const choice: FieldChoice = 'a'
    const coll: CollisionResolutionInput = { nameChoice: 'a', vendorChoice: 'b', versionChoice: 'catalog' }
    expect(sel.selectedIds.size).toBe(1)
    expect(src).toBe('disk')
    expect(single.vendorSource).toBe('catalog')
    expect(choice).toBe('a')
    expect(coll.versionChoice).toBe('catalog')
  })

  it('BulkAcknowledgeRequest / BulkAcknowledgeResult / BulkUndoRequest / BulkUndoResult are assignable', () => {
    const ackReq: BulkAcknowledgeRequest = { audit_ids: ['a1'] }
    const ackRes: BulkAcknowledgeResult = { acknowledged: 2 }
    const undoReq: BulkUndoRequest = { audit_ids: ['a2'] }
    const undoRes: BulkUndoResult = { undone: 1 }
    expect(ackReq.audit_ids).toHaveLength(1)
    expect(ackRes.acknowledged).toBe(2)
    expect(undoReq.audit_ids).toHaveLength(1)
    expect(undoRes.undone).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Steps 4-12: API method behaviour tests
// ---------------------------------------------------------------------------

// Step 4
describe('api.scanner.workbench', () => {
  it('calls GET /scanner/workbench with show_confirmed=true', async () => {
    const spy = mockFetch({ rows: [], orphaned: [], scan_id: null })
    await api.scanner.workbench({ show_confirmed: true })
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/workbench?show_confirmed=true`,
      expect.anything()
    )
  })

  it('includes optional scan_id and bucket params', async () => {
    const spy = mockFetch({ rows: [], orphaned: [], scan_id: 'scan-1' })
    await api.scanner.workbench({ show_confirmed: true, scan_id: 'scan-1', bucket: 'needs_review' })
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('scan_id=scan-1'),
      expect.anything()
    )
  })
})

// Step 5
describe('api.scanner.findLinkCandidates', () => {
  it('calls GET /scanner/links/candidates with type and source_id', async () => {
    const spy = mockFetch({ type: 'unlinked', candidates: [], total: 0 })
    await api.scanner.findLinkCandidates('unlinked', 'uuid-1')
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/links/candidates?type=unlinked&source_id=uuid-1`,
      expect.anything()
    )
  })

  it('appends q param when provided', async () => {
    const spy = mockFetch({ type: 'orphaned', candidates: [], total: 0 })
    await api.scanner.findLinkCandidates('orphaned', 'uuid-2', 'Surge')
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('q=Surge'),
      expect.anything()
    )
  })
})

// Step 6
describe('api.scanner.createLink', () => {
  it('calls POST /scanner/links with body', async () => {
    const spy = mockFetch({ links_created: 1 }, 201)
    const body: CreateLinkRequest = { result_id: 'r1', catalog_record_id: 'c1', catalog_record_table: 'effects' }
    await api.scanner.createLink(body)
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/links`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) })
    )
  })
})

// Step 7
describe('api.scanner.bulkCreateLinks', () => {
  it('calls POST /scanner/links/bulk with body', async () => {
    const spy = mockFetch({ links_created: 3 }, 201)
    const body: BulkCreateLinkRequest = { result_ids: ['r1', 'r2', 'r3'], catalog_record_id: 'c1', catalog_record_table: 'effects' }
    await api.scanner.bulkCreateLinks(body)
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/links/bulk`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) })
    )
  })
})

// Step 8
describe('api.scanner.rejectMatch', () => {
  it('calls POST /scanner/results/{id}/reject with no body', async () => {
    const spy = mockFetch(undefined, 204)
    await api.scanner.rejectMatch('uuid-2')
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/results/uuid-2/reject`,
      expect.objectContaining({ method: 'POST' })
    )
    const callArgs = spy.mock.calls[0][1] as RequestInit
    expect(callArgs.body).toBeUndefined()
  })
})

// Step 9
describe('api.scanner.softReset', () => {
  it('calls POST /scanner/admin/reset/soft', async () => {
    const spy = mockFetch({ type: 'soft', rules_disabled: 5 })
    await api.scanner.softReset()
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/admin/reset/soft`,
      expect.objectContaining({ method: 'POST' })
    )
  })
})

// Step 10
describe('api.scanner.hardReset', () => {
  it('calls POST /scanner/admin/reset/hard with confirmation_text', async () => {
    const spy = mockFetch({ type: 'hard', records_wiped: 100, seeded_rules_restored: 1 })
    await api.scanner.hardReset('RESET ALL SCANNER DATA')
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/admin/reset/hard`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ confirmation_text: 'RESET ALL SCANNER DATA' }),
      })
    )
  })
})

// Step 11
describe('api.scanner.exclude', () => {
  it('calls POST /scanner/exclude with vendor and name', async () => {
    const spy = mockFetch(undefined, 204)
    await api.scanner.exclude('MNTRA', 'Surge XT')
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/exclude`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ vendor: 'MNTRA', name: 'Surge XT' }),
      })
    )
  })
})

// Step 12
describe('api.studio bulk Change Review methods', () => {
  it('bulkAcknowledgeChangeReview calls POST /studio/admin/change-review/bulk-acknowledge', async () => {
    const spy = mockFetch({ acknowledged: 2 })
    await api.studio.bulkAcknowledgeChangeReview(['id1', 'id2'])
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/studio/admin/change-review/bulk-acknowledge`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ audit_ids: ['id1', 'id2'] }),
      })
    )
  })

  it('bulkUndoChangeReview calls POST /studio/admin/change-review/bulk-undo', async () => {
    const spy = mockFetch({ undone: 1 })
    await api.studio.bulkUndoChangeReview(['id1'])
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/studio/admin/change-review/bulk-undo`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ audit_ids: ['id1'] }),
      })
    )
  })
})
