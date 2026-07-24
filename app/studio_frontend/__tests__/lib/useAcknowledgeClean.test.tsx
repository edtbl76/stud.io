import * as React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAcknowledgeClean } from '@/lib/useAcknowledgeClean'
import { WORKBENCH_KEY } from '@/lib/useWorkbench'

jest.mock('@/lib/api', () => ({
  api: { scanner: { acknowledgeClean: jest.fn() } },
}))

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))

const { api } = jest.requireMock('@/lib/api') as { api: { scanner: { acknowledgeClean: jest.Mock } } }
const { toast } = jest.requireMock('sonner') as { toast: { error: jest.Mock } }

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

// Failure path — surfaces a toast, resolves without rejecting (fire-and-forget safe),
// returns 0, and does not invalidate the workbench.
it('surfaces an error toast and resolves to 0 without rejecting when the API fails', async () => {
  api.scanner.acknowledgeClean.mockRejectedValue(new Error('network error'))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

  const { result } = renderHook(() => useAcknowledgeClean(), { wrapper: makeWrapper(qc) })

  await expect(result.current('v1', 'vendor')).resolves.toBe(0)
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/could not acknowledge/i)))
  expect(invalidateSpy).not.toHaveBeenCalled()
})
