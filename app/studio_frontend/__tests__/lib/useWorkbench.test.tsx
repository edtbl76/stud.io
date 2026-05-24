import * as React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useWorkbench } from '@/lib/useWorkbench'
import type { WorkbenchRow, OrphanedRecord, WorkbenchResponse } from '@/lib/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<WorkbenchRow> = {}): WorkbenchRow {
  return {
    result_id: 'r1',
    disk_name: 'Surge XT',
    disk_vendor: 'MNTRA',
    disk_version: '1.0',
    disk_format: 'VST3',
    disk_path: '/path',
    display_name: 'Surge XT',
    display_vendor: 'MNTRA',
    catalog_record_id: null,
    catalog_record_table: null,
    catalog_record_name: null,
    catalog_record_vendor: null,
    catalog_record_version: null,
    bucket: 'unlinked',
    confidence: null,
    confirmed_at: null,
    confirmed_by: null,
    ...overrides,
  }
}

function makeOrphan(overrides: Partial<OrphanedRecord> = {}): OrphanedRecord {
  return {
    catalog_record_id: 'c1',
    catalog_record_table: 'effects',
    name: 'Surge XT',
    vendor: null,
    version: null,
    disk_paths: [],
    ...overrides,
  }
}

const EMPTY_RESPONSE: WorkbenchResponse = { rows: [], orphaned: [], scan_id: null }

// ---------------------------------------------------------------------------
// Mock api.scanner.workbench
// ---------------------------------------------------------------------------

jest.mock('@/lib/api', () => ({
  api: {
    scanner: {
      workbench: jest.fn(),
    },
  },
}))

const { api } = jest.requireMock('@/lib/api') as { api: { scanner: { workbench: jest.Mock } } }

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  jest.clearAllMocks()
  api.scanner.workbench.mockResolvedValue(EMPTY_RESPONSE)
})

// ---------------------------------------------------------------------------
// Step 16: always sends show_confirmed=true
// ---------------------------------------------------------------------------

it('Step 16: always fetches with show_confirmed=true', async () => {
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(api.scanner.workbench).toHaveBeenCalledWith(
    expect.objectContaining({ show_confirmed: true })
  )
})

// ---------------------------------------------------------------------------
// Step 17: rows, orphaned, scanId exposed
// ---------------------------------------------------------------------------

it('Step 17: exposes rows, orphaned and scanId from response', async () => {
  const row = makeRow()
  const orphan = makeOrphan()
  api.scanner.workbench.mockResolvedValue({ rows: [row], orphaned: [orphan], scan_id: 'scan-1' })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.orphaned).toHaveLength(1)
  expect(result.current.scanId).toBe('scan-1')
})

// ---------------------------------------------------------------------------
// Step 18: isLoading
// ---------------------------------------------------------------------------

it('Step 18: isLoading is true while fetching', () => {
  api.scanner.workbench.mockReturnValue(new Promise(() => {}))
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  expect(result.current.isLoading).toBe(true)
})

// ---------------------------------------------------------------------------
// Step 19: sibling filter — known rows
// ---------------------------------------------------------------------------

it('Step 19a: known row IS visible when it has an active sibling', async () => {
  const known = makeRow({ result_id: 'r-known', bucket: 'known', catalog_record_id: 'cat-1' })
  const review = makeRow({ result_id: 'r-review', bucket: 'needs_review', catalog_record_id: 'cat-1' })
  api.scanner.workbench.mockResolvedValue({ rows: [known, review], orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  const ids = result.current.rows.map((r) => r.result_id)
  expect(ids).toContain('r-known')
})

it('Step 19b: known row is hidden when it has no active sibling', async () => {
  const known = makeRow({ result_id: 'r-known', bucket: 'known', catalog_record_id: 'cat-solo' })
  api.scanner.workbench.mockResolvedValue({ rows: [known], orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  const ids = result.current.rows.map((r) => r.result_id)
  expect(ids).not.toContain('r-known')
})

// ---------------------------------------------------------------------------
// Step 20: sibling filter — excluded rows
// ---------------------------------------------------------------------------

it('Step 20a: excluded row is hidden when it has no active sibling', async () => {
  const excl = makeRow({ result_id: 'r-excl', bucket: 'excluded', catalog_record_id: 'cat-x' })
  api.scanner.workbench.mockResolvedValue({ rows: [excl], orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.rows.map((r) => r.result_id)).not.toContain('r-excl')
})

it('Step 20b: excluded row IS visible when a sibling needs attention', async () => {
  const excl = makeRow({ result_id: 'r-excl', bucket: 'excluded', catalog_record_id: 'cat-y' })
  const review = makeRow({ result_id: 'r-review', bucket: 'needs_review', catalog_record_id: 'cat-y' })
  api.scanner.workbench.mockResolvedValue({ rows: [excl, review], orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.rows.map((r) => r.result_id)).toContain('r-excl')
})

// ---------------------------------------------------------------------------
// Step 21: catalog_type client filter
// ---------------------------------------------------------------------------

it('Step 21: catalog_type filter shows only matching table rows', async () => {
  const effects = makeRow({ result_id: 'r-eff', catalog_record_table: 'effects', bucket: 'needs_review', catalog_record_id: 'c1' })
  const instruments = makeRow({ result_id: 'r-inst', catalog_record_table: 'instruments', bucket: 'needs_review', catalog_record_id: 'c2' })
  api.scanner.workbench.mockResolvedValue({ rows: [effects, instruments], orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  act(() => { result.current.setClientFilter({ catalog_type: 'effects' }) })
  const ids = result.current.rows.map((r) => r.result_id)
  expect(ids).toContain('r-eff')
  expect(ids).not.toContain('r-inst')
})

// ---------------------------------------------------------------------------
// Step 22: format client filter
// ---------------------------------------------------------------------------

it('Step 22: format filter shows only matching disk_format rows', async () => {
  const vst3 = makeRow({ result_id: 'r-vst3', disk_format: 'VST3', bucket: 'unlinked' })
  const au = makeRow({ result_id: 'r-au', disk_format: 'AU', bucket: 'unlinked' })
  api.scanner.workbench.mockResolvedValue({ rows: [vst3, au], orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  act(() => { result.current.setClientFilter({ format: 'VST3' }) })
  const ids = result.current.rows.map((r) => r.result_id)
  expect(ids).toContain('r-vst3')
  expect(ids).not.toContain('r-au')
})

// ---------------------------------------------------------------------------
// Steps 24–26: sub-state derivation
// ---------------------------------------------------------------------------

it('Step 24: collision — two needs_review rows sharing catalog_record_id get substate collision', async () => {
  const a = makeRow({ result_id: 'r-a', bucket: 'needs_review', catalog_record_id: 'cat-shared' })
  const b = makeRow({ result_id: 'r-b', bucket: 'needs_review', catalog_record_id: 'cat-shared' })
  api.scanner.workbench.mockResolvedValue({ rows: [a, b], orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.rowSubStates.get('r-a')).toBe('collision')
  expect(result.current.rowSubStates.get('r-b')).toBe('collision')
})

it('Step 25: version mismatch — disk_version differs from catalog_record_version', async () => {
  const row = makeRow({
    result_id: 'r-vm', bucket: 'needs_review', catalog_record_id: 'cat-vm',
    disk_version: '1.0', catalog_record_version: '2.0',
  })
  api.scanner.workbench.mockResolvedValue({ rows: [row], orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.rowSubStates.get('r-vm')).toBe('version mismatch')
})

it('Step 26: unconfirmed — fallback when not collision or version mismatch', async () => {
  const row = makeRow({
    result_id: 'r-uc', bucket: 'needs_review', catalog_record_id: 'cat-uc',
    disk_version: '1.0', catalog_record_version: '1.0',
  })
  api.scanner.workbench.mockResolvedValue({ rows: [row], orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.rowSubStates.get('r-uc')).toBe('unconfirmed')
})

// ---------------------------------------------------------------------------
// Step 23: needs_review_substate client filter (depends on derivation)
// ---------------------------------------------------------------------------

it('Step 23: needs_review_substate filter shows only rows with matching sub-state', async () => {
  const unconfirmed = makeRow({
    result_id: 'r-uc', bucket: 'needs_review', catalog_record_id: 'cat-uc',
    disk_version: '1.0', catalog_record_version: '1.0',
  })
  const mismatch = makeRow({
    result_id: 'r-vm', bucket: 'needs_review', catalog_record_id: 'cat-vm',
    disk_version: '1.0', catalog_record_version: '2.0',
  })
  api.scanner.workbench.mockResolvedValue({ rows: [unconfirmed, mismatch], orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  act(() => { result.current.setClientFilter({ needs_review_substate: 'unconfirmed' }) })
  const ids = result.current.rows.map((r) => r.result_id)
  expect(ids).toContain('r-uc')
  expect(ids).not.toContain('r-vm')
})

// ---------------------------------------------------------------------------
// Step 27: selection handlers
// ---------------------------------------------------------------------------

it('Step 27a: toggleSelect adds then removes an id', async () => {
  const row = makeRow({ result_id: 'r1', bucket: 'unlinked' })
  api.scanner.workbench.mockResolvedValue({ rows: [row], orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  act(() => { result.current.toggleSelect('r1') })
  expect(result.current.selectedIds.has('r1')).toBe(true)

  act(() => { result.current.toggleSelect('r1') })
  expect(result.current.selectedIds.has('r1')).toBe(false)
})

it('Step 27b: shiftSelect selects a range from lastClickedIndex to current', async () => {
  const rows = ['r0', 'r1', 'r2', 'r3'].map((id) => makeRow({ result_id: id, bucket: 'unlinked' }))
  api.scanner.workbench.mockResolvedValue({ rows, orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  act(() => { result.current.toggleSelect('r0') })  // sets lastClickedIndex = 0
  act(() => { result.current.shiftSelect('r2') })    // selects r0, r1, r2
  expect(result.current.selectedIds.has('r0')).toBe(true)
  expect(result.current.selectedIds.has('r1')).toBe(true)
  expect(result.current.selectedIds.has('r2')).toBe(true)
  expect(result.current.selectedIds.has('r3')).toBe(false)
})

it('Step 27c: selectAll selects all visible rows', async () => {
  const rows = ['r0', 'r1', 'r2'].map((id) => makeRow({ result_id: id, bucket: 'unlinked' }))
  api.scanner.workbench.mockResolvedValue({ rows, orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  act(() => { result.current.selectAll() })
  expect(result.current.selectedIds.size).toBe(3)
})

it('Step 27d: clearSelection empties selectedIds', async () => {
  const row = makeRow({ result_id: 'r1', bucket: 'unlinked' })
  api.scanner.workbench.mockResolvedValue({ rows: [row], orphaned: [], scan_id: null })
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  act(() => { result.current.toggleSelect('r1') })
  act(() => { result.current.clearSelection() })
  expect(result.current.selectedIds.size).toBe(0)
})

// ---------------------------------------------------------------------------
// Step 28: invalidate
// ---------------------------------------------------------------------------

it('Step 28: invalidate calls queryClient.invalidateQueries for workbench key', async () => {
  const { result } = renderHook(() => useWorkbench(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  const callsBefore = api.scanner.workbench.mock.calls.length
  act(() => { result.current.invalidate() })
  await waitFor(() => expect(api.scanner.workbench.mock.calls.length).toBeGreaterThan(callsBefore))
})
