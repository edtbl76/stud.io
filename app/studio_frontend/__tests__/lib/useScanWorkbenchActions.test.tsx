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

it('hardReset state: setHardResetOpen controls dialog visibility', () => {
  const { result } = renderHook(() => useScanWorkbenchActions(makeHookArgs()))
  expect(result.current.hardResetOpen).toBe(false)
  act(() => { result.current.setHardResetOpen(true) })
  expect(result.current.hardResetOpen).toBe(true)
  act(() => { result.current.handleHardResetCancel() })
  expect(result.current.hardResetOpen).toBe(false)
})
