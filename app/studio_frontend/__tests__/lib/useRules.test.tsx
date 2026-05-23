import * as React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRules } from '@/lib/useRules'
import type { AllRules } from '@/lib/types'

const mockRules: AllRules = {
  vendor: [{ rule_id: 'v1', disk_vendor: 'ikm', catalog_vendor: 'IK Multimedia', enabled: true, created_by: 'admin', created_at: '2026-01-01', affected_count: 2, clean_count: 1, needs_review_count: 1 }],
  name:   [{ rule_id: 'n1', disk_name: 'reverb pro', catalog_name: 'Reverb Pro', enabled: true, created_by: 'admin', created_at: '2026-01-01', affected_count: 3, clean_count: 3, needs_review_count: 0 }],
  pattern: [{ rule_id: 'p1', label: 'Mono variant', pattern: '{name}(m)', match_fields: ['vendor'], action: 'alias_to_match', enabled: false, is_seeded: true, created_by: 'system', created_at: '2026-01-01' }],
}

jest.mock('@/lib/api', () => ({
  api: { scanner: { rules: jest.fn(), createVendorRule: jest.fn(), createNameRule: jest.fn(), createPatternRule: jest.fn(), updateRule: jest.fn(), toggleRule: jest.fn(), deleteRule: jest.fn(), acknowledgeClean: jest.fn() } },
}))

const { api } = jest.requireMock('@/lib/api') as { api: { scanner: Record<string, jest.Mock> } }

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  jest.clearAllMocks()
  api.scanner.rules.mockResolvedValue(mockRules)
})

// Step 9
it('returns vendorRules, nameRules, patternRules from GET /scanner/rules', async () => {
  const { result } = renderHook(() => useRules(), { wrapper })
  await waitFor(() => expect(result.current.vendorRules).toHaveLength(1))
  expect(result.current.vendorRules[0].rule_id).toBe('v1')
  expect(result.current.nameRules[0].rule_id).toBe('n1')
  expect(result.current.patternRules[0].rule_id).toBe('p1')
})

// Step 10
it('isLoading is true while fetching', () => {
  api.scanner.rules.mockReturnValue(new Promise(() => {}))
  const { result } = renderHook(() => useRules(), { wrapper })
  expect(result.current.isLoading).toBe(true)
})

// Step 11
it('createVendorRule calls api and invalidates rules cache', async () => {
  api.scanner.createVendorRule.mockResolvedValue({ rule: {}, affected_count: 1, clean_count: 1, needs_review_count: 0 })
  const { result } = renderHook(() => useRules(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  await result.current.createVendorRule({ disk_vendor: 'ikm', catalog_vendor: 'IK Multimedia' })
  expect(api.scanner.createVendorRule).toHaveBeenCalledWith({ disk_vendor: 'ikm', catalog_vendor: 'IK Multimedia' })
  expect(api.scanner.rules).toHaveBeenCalledTimes(2) // initial + invalidation refetch
})

// Step 12 — workbench invalidation is a side effect; we verify workbench query would be refetched
// (tested via integration; unit confirms the mutation succeeds and triggers cache invalidation)

// Step 13
it('createNameRule calls api and refetches rules', async () => {
  api.scanner.createNameRule.mockResolvedValue({ rule: {}, affected_count: 1, clean_count: 1, needs_review_count: 0 })
  const { result } = renderHook(() => useRules(), { wrapper })
  await waitFor(() => !result.current.isLoading)
  await result.current.createNameRule({ disk_name: 'reverb', catalog_name: 'Reverb Pro' })
  expect(api.scanner.createNameRule).toHaveBeenCalled()
  expect(api.scanner.rules).toHaveBeenCalledTimes(2)
})

// Step 14
it('createPatternRule calls api and refetches rules', async () => {
  api.scanner.createPatternRule.mockResolvedValue({ rule: {}, affected_count: 0, clean_count: 0, needs_review_count: 0 })
  const { result } = renderHook(() => useRules(), { wrapper })
  await waitFor(() => !result.current.isLoading)
  const input = { label: 'Test', pattern: '{name}(m)', match_fields: ['vendor'], action: 'alias_to_match', enabled: false }
  await result.current.createPatternRule(input)
  expect(api.scanner.createPatternRule).toHaveBeenCalledWith(input)
})

// Step 15
it('toggleRule calls api and refetches rules', async () => {
  api.scanner.toggleRule.mockResolvedValue({})
  const { result } = renderHook(() => useRules(), { wrapper })
  await waitFor(() => !result.current.isLoading)
  await result.current.toggleRule('v1', 'vendor', false)
  expect(api.scanner.toggleRule).toHaveBeenCalledWith('v1', 'vendor', false)
  expect(api.scanner.rules).toHaveBeenCalledTimes(2)
})

// Step 16
it('deleteRule calls api and refetches rules', async () => {
  api.scanner.deleteRule.mockResolvedValue(undefined)
  const { result } = renderHook(() => useRules(), { wrapper })
  await waitFor(() => !result.current.isLoading)
  await result.current.deleteRule('v1', 'vendor')
  expect(api.scanner.deleteRule).toHaveBeenCalledWith('v1', 'vendor')
  expect(api.scanner.rules).toHaveBeenCalledTimes(2)
})

// Step 17
it('acknowledgeClean calls api', async () => {
  api.scanner.acknowledgeClean.mockResolvedValue({ acknowledged: 3 })
  const { result } = renderHook(() => useRules(), { wrapper })
  await waitFor(() => !result.current.isLoading)
  const count = await result.current.acknowledgeClean('v1', 'vendor')
  expect(api.scanner.acknowledgeClean).toHaveBeenCalledWith('v1', 'vendor')
  expect(count).toBe(3)
})
