import * as React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useScanWorkbenchActions } from '@/lib/useScanWorkbenchActions'
import type { NeedsReviewSubState, WorkbenchRow } from '@/lib/types'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/lib/api', () => ({
  api: {
    scanner: {
      rejectMatch: jest.fn(),
      exclude: jest.fn(),
      bulkUpdate: jest.fn(),
      softReset: jest.fn(),
      hardReset: jest.fn(),
    },
  },
}))

import { api } from '@/lib/api'
import { toast } from 'sonner'
const mockApi = api as jest.Mocked<typeof api>
const mockToast = toast as jest.Mocked<typeof toast>

function makeRow(overrides: Partial<WorkbenchRow> = {}): WorkbenchRow {
  return {
    result_id: 'r1', disk_name: 'Surge XT', disk_vendor: 'MNTRA', disk_version: '1.0',
    disk_format: 'VST3', disk_path: '/p', display_name: 'Surge XT', display_vendor: 'MNTRA',
    catalog_record_id: null, catalog_record_table: null, catalog_record_name: null,
    catalog_record_vendor: null, catalog_record_version: null,
    bucket: 'unlinked', confidence: null, confirmed_at: null, confirmed_by: null,
    ...overrides,
  }
}

function makeHookArgs(overrides: Partial<Parameters<typeof useScanWorkbenchActions>[0]> = {}) {
  return {
    rows: [],
    selectedIds: new Set<string>(),
    rowSubStates: new Map<string, NeedsReviewSubState>(),
    invalidate: jest.fn(),
    clearSelection: jest.fn(),
    ...overrides,
  }
}

afterEach(() => jest.clearAllMocks())

it('handleReject calls rejectMatch and invalidates on success', async () => {
  const invalidate = jest.fn()
  const row = makeRow({ result_id: 'r1' })
  ;(mockApi.scanner.rejectMatch as jest.Mock).mockResolvedValue(undefined)
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs({ invalidate })))
  await act(async () => { await result.current.handleReject(row) })
  expect(mockApi.scanner.rejectMatch).toHaveBeenCalledWith('r1')
  expect(invalidate).toHaveBeenCalled()
})

it('handleReject shows error toast on failure', async () => {
  ;(mockApi.scanner.rejectMatch as jest.Mock).mockRejectedValue(new Error('network'))
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs()))
  await act(async () => { await result.current.handleReject(makeRow()) })
  expect(mockToast.error).toHaveBeenCalledWith('network')
})

it('handleFindLink sets activeModal to find-link-unlinked', () => {
  const row = makeRow({ result_id: 'r-unlinked', bucket: 'unlinked' })
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs()))
  act(() => { result.current.handleFindLink(row) })
  expect(result.current.activeModal).toEqual({ type: 'find-link-unlinked', sourceId: 'r-unlinked' })
})

it('handleBulkUpdate calls bulkUpdate with mismatch ids and invalidates', async () => {
  const row = makeRow({ result_id: 'r-m', bucket: 'needs_review', catalog_record_id: 'c1' })
  const rowSubStates = new Map<string, NeedsReviewSubState>([['r-m', 'mismatch']])
  const invalidate = jest.fn()
  const clearSelection = jest.fn()
  ;(mockApi.scanner.bulkUpdate as jest.Mock).mockResolvedValue({ updated: 1 })
  const { result } = renderHook(() => useScanWorkbenchActions(
    makeHookArgs({ rows: [row], selectedIds: new Set(['r-m']), rowSubStates, invalidate, clearSelection })
  ))
  await act(async () => { await result.current.handleBulkUpdate() })
  expect(mockApi.scanner.bulkUpdate).toHaveBeenCalledWith(['r-m'])
  expect(clearSelection).toHaveBeenCalled()
  expect(invalidate).toHaveBeenCalled()
})

it('handleBulkExclude always calls clearSelection and invalidate, toasts only failed rows', async () => {
  const r1 = makeRow({ result_id: 'r1', disk_vendor: 'V', disk_name: 'Good', disk_format: 'VST3' })
  const r2 = makeRow({ result_id: 'r2', disk_vendor: 'V', disk_name: 'Bad', disk_format: 'VST3' })
  const clearSelection = jest.fn()
  const invalidate = jest.fn()
  ;(mockApi.scanner.exclude as jest.Mock)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('server error'))
  const { result } = renderHook(() => useScanWorkbenchActions(
    makeHookArgs({ rows: [r1, r2], selectedIds: new Set(['r1', 'r2']), clearSelection, invalidate })
  ))
  await act(async () => { await result.current.handleBulkExclude() })
  expect(clearSelection).toHaveBeenCalled()
  expect(invalidate).toHaveBeenCalled()
  expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('Bad'))
})

it('hardReset state: setHardResetOpen controls dialog visibility', () => {
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs()))
  expect(result.current.hardResetOpen).toBe(false)
  act(() => { result.current.setHardResetOpen(true) })
  expect(result.current.hardResetOpen).toBe(true)
  act(() => { result.current.handleHardResetCancel() })
  expect(result.current.hardResetOpen).toBe(false)
})

// U-15: handleRowClick dispatcher (row-click routing by bucket)

// Step 5 — needs_review opens the editable single-resolution modal
it('handleRowClick routes a needs_review row to the editable single-resolution modal', () => {
  const row = makeRow({ result_id: 'r-nr', bucket: 'needs_review', catalog_record_id: 'c1', catalog_record_table: 'instruments' })
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs()))
  act(() => { result.current.handleRowClick(row) })
  expect(result.current.activeModal).toEqual({ type: 'single-resolution', row, readOnly: false })
})

// Step 6 — collision routes to the collision modal
it('handleRowClick routes a collision row to the collision modal', () => {
  const row = makeRow({ result_id: 'r-c', bucket: 'collision' })
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs()))
  act(() => { result.current.handleRowClick(row) })
  expect(result.current.activeModal).toEqual({ type: 'collision', row })
})

// Step 7 — unlinked routes to find-link
it('handleRowClick routes an unlinked row to the find-link modal', () => {
  const row = makeRow({ result_id: 'r-u', bucket: 'unlinked' })
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs()))
  act(() => { result.current.handleRowClick(row) })
  expect(result.current.activeModal).toEqual({ type: 'find-link-unlinked', sourceId: 'r-u' })
})

// Step 8 — known opens the read-only single-resolution modal
it('handleRowClick routes a known row to the read-only single-resolution modal', () => {
  const row = makeRow({ result_id: 'r-k', bucket: 'known', catalog_record_id: 'c1', catalog_record_table: 'instruments' })
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs()))
  act(() => { result.current.handleRowClick(row) })
  expect(result.current.activeModal).toEqual({ type: 'single-resolution', row, readOnly: true })
})

// Step 9 — excluded is a no-op
it('handleRowClick does nothing for an excluded row', () => {
  const row = makeRow({ result_id: 'r-x', bucket: 'excluded' })
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs()))
  act(() => { result.current.handleRowClick(row) })
  expect(result.current.activeModal).toBeNull()
})

// Step 10 — unknown bucket is a no-op (excluded is the only unrouted real bucket; use an invalid value to hit the default)
it('handleRowClick does nothing for an unrouted bucket', () => {
  const row = makeRow({ result_id: 'r-?', bucket: 'nonexistent' as WorkbenchRow['bucket'] })
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs()))
  act(() => { result.current.handleRowClick(row) })
  expect(result.current.activeModal).toBeNull()
})

// U-16 Step 7 — handleOrphanRowFindLink opens find-link-orphaned with the catalog id
it('handleOrphanRowFindLink opens find-link-orphaned with the catalog record id', () => {
  const row = makeRow({ result_id: 'o1', bucket: 'orphaned', catalog_record_id: 'cat-9', catalog_record_table: 'effects' })
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs()))
  act(() => { result.current.handleOrphanRowFindLink(row) })
  expect(result.current.activeModal).toEqual({ type: 'find-link-orphaned', sourceId: 'cat-9' })
})

// U-16 Step 8 — orphaned row-click opens find-link-orphaned
it('handleRowClick routes an orphaned row to find-link-orphaned', () => {
  const row = makeRow({ result_id: 'o1', bucket: 'orphaned', catalog_record_id: 'cat-9', catalog_record_table: 'effects' })
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs()))
  act(() => { result.current.handleRowClick(row) })
  expect(result.current.activeModal).toEqual({ type: 'find-link-orphaned', sourceId: 'cat-9' })
})

// Step 11 — a row click does not disturb an in-progress bulk-resolve queue
it('handleRowClick leaves an in-progress bulkResolveQueue untouched', () => {
  const queued = makeRow({ result_id: 'r-queued', bucket: 'needs_review', catalog_record_id: 'c9', catalog_record_table: 'instruments' })
  const clicked = makeRow({ result_id: 'r-click', bucket: 'needs_review', catalog_record_id: 'c1', catalog_record_table: 'instruments' })
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs()))
  act(() => { result.current.setBulkResolveQueue([queued]) })
  act(() => { result.current.handleRowClick(clicked) })
  expect(result.current.bulkResolveQueue).toEqual([queued])
  expect(result.current.currentModalRow).toEqual(queued)
  expect(result.current.activeModal).toEqual({ type: 'single-resolution', row: clicked, readOnly: false })
})

// U-20: bulk-confirmation gate — request/commit split (BR-U20-01, BR-U20-03)

// Steps 23-25 — each request* opens the gate without firing its API (table-driven)
type RequestMethod = 'requestBulkExclude' | 'requestBulkReject' | 'requestBulkUpdate'
type ScannerApiMethod = 'exclude' | 'rejectMatch' | 'bulkUpdate'

const GATE_CASES: Array<{
  method: RequestMethod
  rows: WorkbenchRow[]
  rowSubStates?: Map<string, NeedsReviewSubState>
  expected: Partial<{ kind: string; affectedCount: number; skippedCount: number; destructive: boolean }>
  apiMethod: ScannerApiMethod
}> = [
  {
    method: 'requestBulkExclude',
    rows: [makeRow({ result_id: 'r1', bucket: 'unlinked' }), makeRow({ result_id: 'r2', bucket: 'known' })],
    expected: { kind: 'exclude', affectedCount: 2 },
    apiMethod: 'exclude',
  },
  {
    method: 'requestBulkReject',
    rows: [makeRow({ result_id: 'r1', bucket: 'needs_review' }), makeRow({ result_id: 'r2', bucket: 'unlinked' })],
    expected: { kind: 'reject', affectedCount: 1, skippedCount: 1 },
    apiMethod: 'rejectMatch',
  },
  {
    method: 'requestBulkUpdate',
    rows: [makeRow({ result_id: 'r1', bucket: 'needs_review' })],
    rowSubStates: new Map<string, NeedsReviewSubState>([['r1', 'mismatch']]),
    expected: { kind: 'bulk-update', affectedCount: 1, destructive: false },
    apiMethod: 'bulkUpdate',
  },
]

it.each(GATE_CASES)('$method sets the ConfirmationRequest and fires no API call', ({ method, rows, rowSubStates, expected, apiMethod }) => {
  const selectedIds = new Set(rows.map((r) => r.result_id))
  const { result } = renderHook(() => useScanWorkbenchActions(
    makeHookArgs({ rows, selectedIds, rowSubStates: rowSubStates ?? new Map() })
  ))
  act(() => { result.current[method]() })
  expect(result.current.pendingConfirm).toMatchObject(expected)
  expect(mockApi.scanner[apiMethod]).not.toHaveBeenCalled()
})

// Step 26 — confirmPending for exclude runs the existing handler and clears the gate
it('confirmPending runs handleBulkExclude for an exclude request and clears pendingConfirm', async () => {
  const r1 = makeRow({ result_id: 'r1', disk_vendor: 'V', disk_name: 'A', disk_format: 'VST3', bucket: 'unlinked' })
  ;(mockApi.scanner.exclude as jest.Mock).mockResolvedValue(undefined)
  const { result } = renderHook(() => useScanWorkbenchActions(
    makeHookArgs({ rows: [r1], selectedIds: new Set(['r1']) })
  ))
  act(() => { result.current.requestBulkExclude() })
  await act(async () => { await result.current.confirmPending() })
  expect(mockApi.scanner.exclude).toHaveBeenCalledWith('V', 'A', 'VST3')
  expect(result.current.pendingConfirm).toBeNull()
})

// Step 27 — confirmPending routes reject and bulk-update to their existing handlers
it('confirmPending runs the sequential reject for a reject request', async () => {
  const r1 = makeRow({ result_id: 'r1', bucket: 'needs_review' })
  ;(mockApi.scanner.rejectMatch as jest.Mock).mockResolvedValue(undefined)
  const { result } = renderHook(() => useScanWorkbenchActions(
    makeHookArgs({ rows: [r1], selectedIds: new Set(['r1']) })
  ))
  act(() => { result.current.requestBulkReject() })
  await act(async () => { await result.current.confirmPending() })
  expect(mockApi.scanner.rejectMatch).toHaveBeenCalledWith('r1')
})

it('confirmPending runs bulkUpdate for a bulk-update request', async () => {
  const r1 = makeRow({ result_id: 'r1', bucket: 'needs_review' })
  const rowSubStates = new Map<string, NeedsReviewSubState>([['r1', 'mismatch']])
  ;(mockApi.scanner.bulkUpdate as jest.Mock).mockResolvedValue({ updated: 1 })
  const { result } = renderHook(() => useScanWorkbenchActions(
    makeHookArgs({ rows: [r1], selectedIds: new Set(['r1']), rowSubStates })
  ))
  act(() => { result.current.requestBulkUpdate() })
  await act(async () => { await result.current.confirmPending() })
  expect(mockApi.scanner.bulkUpdate).toHaveBeenCalledWith(['r1'])
})

// Step 28 — cancelConfirm aborts with no API call and no selection change
it('cancelConfirm clears pendingConfirm without any API call or clearSelection', () => {
  const clearSelection = jest.fn()
  const r1 = makeRow({ result_id: 'r1', bucket: 'unlinked' })
  const { result } = renderHook(() => useScanWorkbenchActions(
    makeHookArgs({ rows: [r1], selectedIds: new Set(['r1']), clearSelection })
  ))
  act(() => { result.current.requestBulkExclude() })
  act(() => { result.current.cancelConfirm() })
  expect(result.current.pendingConfirm).toBeNull()
  expect(mockApi.scanner.exclude).not.toHaveBeenCalled()
  expect(clearSelection).not.toHaveBeenCalled()
})
