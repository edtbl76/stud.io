import * as React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAcknowledgeClean } from '@/lib/useAcknowledgeClean'
import { WORKBENCH_KEY } from '@/lib/useWorkbench'

jest.mock('@/lib/api', () => ({
  api: { scanner: { acknowledgeClean: jest.fn() } },
}))

const { api } = jest.requireMock('@/lib/api') as { api: { scanner: { acknowledgeClean: jest.Mock } } }

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

beforeEach(() => jest.clearAllMocks())

// Step 11 (T11)
it('acknowledges via the API, invalidates the workbench, and returns the acknowledged count', async () => {
  api.scanner.acknowledgeClean.mockResolvedValue({ acknowledged: 7 })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

  const { result } = renderHook(() => useAcknowledgeClean(), { wrapper: makeWrapper(qc) })

  const count = await result.current('v1', 'vendor')

  expect(api.scanner.acknowledgeClean).toHaveBeenCalledWith('v1', 'vendor')
  expect(count).toBe(7)
  await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WORKBENCH_KEY }))
})
