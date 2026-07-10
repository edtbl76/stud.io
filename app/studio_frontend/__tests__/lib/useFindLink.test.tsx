import * as React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFindLink } from '@/lib/useFindLink'

jest.mock('@/lib/api', () => ({
  api: {
    scanner: {
      findLinkCandidates: jest.fn(),
      createLink: jest.fn(),
      bulkCreateLinks: jest.fn(),
    },
  },
}))

const { api } = jest.requireMock('@/lib/api') as {
  api: { scanner: Record<string, jest.Mock> }
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const ORPHAN_CANDIDATES = { type: 'unlinked' as const, candidates: [{ catalog_record_id: 'c1', catalog_record_table: 'effects', name: 'Surge XT', vendor: null, version: null, disk_paths: [] }], total: 1 }
const UNLINKED_CANDIDATES = { type: 'orphaned' as const, candidates: [{ result_id: 'r1', disk_name: 'Surge XT', disk_vendor: 'MNTRA', disk_version: '1.0', disk_format: 'VST3', disk_path: '/p', display_name: 'Surge XT', display_vendor: 'MNTRA', catalog_record_id: null, catalog_record_table: null, catalog_record_name: null, catalog_record_vendor: null, catalog_record_version: null, bucket: 'unlinked' as const, confidence: null, confirmed_at: null, confirmed_by: null }], total: 1 }

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  api.scanner.findLinkCandidates.mockResolvedValue(ORPHAN_CANDIDATES)
})

afterEach(() => {
  jest.useRealTimers()
})

// Step 29: fetches candidates for unlinked-to-orphaned mode
it('Step 29: fetches candidates with type=unlinked for unlinked-to-orphaned mode', async () => {
  const { result } = renderHook(
    () => useFindLink('unlinked-to-orphaned', 'uuid-1'),
    { wrapper }
  )
  jest.runAllTimers()
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(api.scanner.findLinkCandidates).toHaveBeenCalledWith('unlinked', 'uuid-1', '')
})

it('Step 29b: fetches candidates with type=orphaned for orphaned-to-unlinked mode', async () => {
  api.scanner.findLinkCandidates.mockResolvedValue(UNLINKED_CANDIDATES)
  const { result } = renderHook(
    () => useFindLink('orphaned-to-unlinked', 'cat-1'),
    { wrapper }
  )
  jest.runAllTimers()
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(api.scanner.findLinkCandidates).toHaveBeenCalledWith('orphaned', 'cat-1', '')
})

// Step 30: query is debounced 300ms
it('Step 30: does not refetch immediately when query changes — debounces 300ms', async () => {
  const { result } = renderHook(
    () => useFindLink('unlinked-to-orphaned', 'uuid-1'),
    { wrapper }
  )
  jest.runAllTimers()
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  const callsBefore = api.scanner.findLinkCandidates.mock.calls.length

  act(() => { result.current.setQuery('Surge') })
  // Before 300ms passes, no new fetch
  expect(api.scanner.findLinkCandidates.mock.calls.length).toBe(callsBefore)

  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() =>
    expect(api.scanner.findLinkCandidates).toHaveBeenCalledWith('unlinked', 'uuid-1', 'Surge')
  )
})

// Step 31: unlinked-to-orphaned is single-select
it('Step 31: single-select — second toggleCandidate replaces first selection', async () => {
  api.scanner.findLinkCandidates.mockResolvedValue({
    type: 'unlinked', candidates: [
      { catalog_record_id: 'c1', catalog_record_table: 'effects', name: 'A', vendor: null, version: null, disk_paths: [] },
      { catalog_record_id: 'c2', catalog_record_table: 'effects', name: 'B', vendor: null, version: null, disk_paths: [] },
    ], total: 2,
  })
  const { result } = renderHook(
    () => useFindLink('unlinked-to-orphaned', 'uuid-1'),
    { wrapper }
  )
  jest.runAllTimers()
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  act(() => { result.current.toggleCandidate('c1') })
  expect(result.current.selectedIds.has('c1')).toBe(true)

  act(() => { result.current.toggleCandidate('c2') })
  expect(result.current.selectedIds.has('c1')).toBe(false)
  expect(result.current.selectedIds.has('c2')).toBe(true)
})

// Step 32: orphaned-to-unlinked is multi-select
it('Step 32: multi-select — both ids are selected after two toggles', async () => {
  api.scanner.findLinkCandidates.mockResolvedValue({
    type: 'orphaned', candidates: [
      { ...UNLINKED_CANDIDATES.candidates[0], result_id: 'r1' },
      { ...UNLINKED_CANDIDATES.candidates[0], result_id: 'r2' },
    ], total: 2,
  })
  const { result } = renderHook(
    () => useFindLink('orphaned-to-unlinked', 'cat-1'),
    { wrapper }
  )
  jest.runAllTimers()
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  act(() => { result.current.toggleCandidate('r1') })
  act(() => { result.current.toggleCandidate('r2') })
  expect(result.current.selectedIds.has('r1')).toBe(true)
  expect(result.current.selectedIds.has('r2')).toBe(true)
})

// Step 33: confirmLink calls correct API based on mode
it('Step 33a: single-select mode calls createLink', async () => {
  api.scanner.findLinkCandidates.mockResolvedValue(ORPHAN_CANDIDATES)
  api.scanner.createLink.mockResolvedValue({ links_created: 1 })
  const { result } = renderHook(
    () => useFindLink('unlinked-to-orphaned', 'uuid-src'),
    { wrapper }
  )
  jest.runAllTimers()
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  act(() => { result.current.toggleCandidate('c1') })
  await act(async () => { await result.current.confirmLink() })

  expect(api.scanner.createLink).toHaveBeenCalledWith(
    expect.objectContaining({ result_id: 'uuid-src', catalog_record_id: 'c1' })
  )
  expect(api.scanner.bulkCreateLinks).not.toHaveBeenCalled()
})

it('Step 33b: multi-select mode calls bulkCreateLinks with result_ids', async () => {
  api.scanner.findLinkCandidates.mockResolvedValue({
    type: 'orphaned', candidates: [
      { ...UNLINKED_CANDIDATES.candidates[0], result_id: 'r1' },
      { ...UNLINKED_CANDIDATES.candidates[0], result_id: 'r2' },
    ], total: 2,
  })
  api.scanner.bulkCreateLinks.mockResolvedValue({ links_created: 2 })
  const { result } = renderHook(
    () => useFindLink('orphaned-to-unlinked', 'cat-src'),
    { wrapper }
  )
  jest.runAllTimers()
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  act(() => { result.current.toggleCandidate('r1') })
  act(() => { result.current.toggleCandidate('r2') })
  await act(async () => { await result.current.confirmLink() })

  expect(api.scanner.bulkCreateLinks).toHaveBeenCalledWith(
    expect.objectContaining({ result_ids: expect.arrayContaining(['r1', 'r2']), catalog_record_id: 'cat-src' })
  )
  expect(api.scanner.createLink).not.toHaveBeenCalled()
})

// U-11 Step 10: create_rules defaults to false on single-mode createLink
it('U-11: createLink sends create_rules=false by default', async () => {
  api.scanner.findLinkCandidates.mockResolvedValue(ORPHAN_CANDIDATES)
  api.scanner.createLink.mockResolvedValue({ links_created: 1 })
  const { result } = renderHook(() => useFindLink('unlinked-to-orphaned', 'uuid-src'), { wrapper })
  jest.runAllTimers()
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  act(() => { result.current.toggleCandidate('c1') })
  await act(async () => { await result.current.confirmLink() })

  expect(api.scanner.createLink).toHaveBeenCalledWith(
    expect.objectContaining({ create_rules: false })
  )
})

// U-11 Step 11: create_rules=true when the flag is set (single mode)
it('U-11: createLink sends create_rules=true after setCreateRules(true)', async () => {
  api.scanner.findLinkCandidates.mockResolvedValue(ORPHAN_CANDIDATES)
  api.scanner.createLink.mockResolvedValue({ links_created: 1 })
  const { result } = renderHook(() => useFindLink('unlinked-to-orphaned', 'uuid-src'), { wrapper })
  jest.runAllTimers()
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  act(() => { result.current.toggleCandidate('c1') })
  act(() => { result.current.setCreateRules(true) })
  await act(async () => { await result.current.confirmLink() })

  expect(api.scanner.createLink).toHaveBeenCalledWith(
    expect.objectContaining({ create_rules: true })
  )
})

// U-11 Step 12: bulk-mode threads create_rules onto bulkCreateLinks
it('U-11: bulkCreateLinks threads create_rules flag', async () => {
  api.scanner.findLinkCandidates.mockResolvedValue({
    type: 'orphaned', candidates: [
      { ...UNLINKED_CANDIDATES.candidates[0], result_id: 'r1' },
      { ...UNLINKED_CANDIDATES.candidates[0], result_id: 'r2' },
    ], total: 2,
  })
  api.scanner.bulkCreateLinks.mockResolvedValue({ links_created: 2 })
  const { result } = renderHook(() => useFindLink('orphaned-to-unlinked', 'cat-src'), { wrapper })
  jest.runAllTimers()
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  act(() => { result.current.toggleCandidate('r1') })
  act(() => { result.current.setCreateRules(true) })
  await act(async () => { await result.current.confirmLink() })

  expect(api.scanner.bulkCreateLinks).toHaveBeenCalledWith(
    expect.objectContaining({ create_rules: true })
  )
})
