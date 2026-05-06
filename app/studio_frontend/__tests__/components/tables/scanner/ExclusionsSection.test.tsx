import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExclusionsSection } from '@/components/tables/scanner/ExclusionsSection'

jest.mock('@/lib/api', () => ({
  api: {
    scanner: {
      exclusions: jest.fn(),
      removeExclusion: jest.fn(),
    },
  },
}))

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))

const { api } = jest.requireMock('@/lib/api') as { api: { scanner: { exclusions: jest.Mock; removeExclusion: jest.Mock } } }

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('ExclusionsSection', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows empty state when no exclusions', async () => {
    api.scanner.exclusions.mockResolvedValue([])
    render(<ExclusionsSection />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('exclusions-empty-state')).toBeInTheDocument())
  })

  it('renders exclusion rows', async () => {
    api.scanner.exclusions.mockResolvedValue([
      { exclusion_id: 'ex1', vendor: 'Acme', name: 'Reverb', excluded_at: '2026-01-01T00:00:00Z' },
    ])
    render(<ExclusionsSection />, { wrapper })
    await waitFor(() => expect(screen.getByText('Reverb')).toBeInTheDocument())
    expect(screen.getByTestId('remove-exclusion-button-ex1')).toBeInTheDocument()
  })

  it('shows confirmation dialog when Remove is clicked', async () => {
    api.scanner.exclusions.mockResolvedValue([
      { exclusion_id: 'ex1', vendor: 'Acme', name: 'Reverb', excluded_at: '2026-01-01T00:00:00Z' },
    ])
    render(<ExclusionsSection />, { wrapper })
    await waitFor(() => screen.getByTestId('remove-exclusion-button-ex1'))
    fireEvent.click(screen.getByTestId('remove-exclusion-button-ex1'))
    expect(screen.getByTestId('exclusion-confirm-remove-button')).toBeInTheDocument()
  })

  it('calls removeExclusion on confirm', async () => {
    api.scanner.exclusions.mockResolvedValue([
      { exclusion_id: 'ex1', vendor: 'Acme', name: 'Reverb', excluded_at: '2026-01-01T00:00:00Z' },
    ])
    api.scanner.removeExclusion.mockResolvedValue(undefined)
    render(<ExclusionsSection />, { wrapper })
    await waitFor(() => screen.getByTestId('remove-exclusion-button-ex1'))
    fireEvent.click(screen.getByTestId('remove-exclusion-button-ex1'))
    fireEvent.click(screen.getByTestId('exclusion-confirm-remove-button'))
    await waitFor(() => expect(api.scanner.removeExclusion).toHaveBeenCalledWith('ex1'))
  })
})
