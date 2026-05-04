import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ScannerPageShell } from '@/components/tables/scanner/ScannerPageShell'

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { username: 'admin', role: 'admin' }, login: jest.fn(), loginGoogle: jest.fn() }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    scanner: {
      runs: jest.fn(),
      report: jest.fn(),
      confirm: jest.fn(),
      dismiss: jest.fn(),
      keep: jest.fn(),
      exclusions: jest.fn(),
      removeExclusion: jest.fn(),
      purge: jest.fn(),
    },
    create: jest.fn(),
  },
}))

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))

// react-virtual requires DOM measurement APIs not available in jsdom
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => opts.count * opts.estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, i) => ({
        key: i, index: i, start: i * opts.estimateSize(), size: opts.estimateSize(),
      })),
    measureElement: jest.fn(),
  }),
}))

const { api } = jest.requireMock('@/lib/api') as { api: { scanner: Record<string, jest.Mock>; create: jest.Mock } }

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('ScannerPageShell', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows empty state when no scan runs exist', async () => {
    api.scanner.runs.mockResolvedValue([])
    render(<ScannerPageShell section="matched" />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('scanner-no-scans-state')).toBeInTheDocument())
  })

  it('renders matched results when report loads', async () => {
    api.scanner.runs.mockResolvedValue([
      { scan_id: 's1', scanned_at: '2026-05-04T12:00:00Z', matched: 1, version_mismatch: 0, unconfirmed: 0, untracked: 0, orphaned: 0, ignored: 0 },
    ])
    api.scanner.report.mockResolvedValue({
      scan_id: 's1',
      scanned_at: '2026-05-04T12:00:00Z',
      matched: [{ result_id: 'r1', status: 'matched', name: 'Reverb Pro', vendor: 'Acme', version: '1.0', format: 'vst3', path: '/p', confidence: null, score: null, matched_record: null, dismissed_at: null }],
      version_mismatch: [], unconfirmed: [], untracked: [], orphaned: [], ignored: [],
    })
    render(<ScannerPageShell section="matched" />, { wrapper })
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
  })

  it('shows section empty state when section has no results', async () => {
    api.scanner.runs.mockResolvedValue([
      { scan_id: 's1', scanned_at: '2026-05-04T12:00:00Z', matched: 0, version_mismatch: 0, unconfirmed: 0, untracked: 0, orphaned: 0, ignored: 0 },
    ])
    api.scanner.report.mockResolvedValue({
      scan_id: 's1', scanned_at: '2026-05-04T12:00:00Z',
      matched: [], version_mismatch: [], unconfirmed: [], untracked: [], orphaned: [], ignored: [],
    })
    render(<ScannerPageShell section="matched" />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('scanner-empty-state')).toBeInTheDocument())
  })

  it('shows retry button when report fails to load', async () => {
    api.scanner.runs.mockResolvedValue([
      { scan_id: 's1', scanned_at: '2026-05-04T12:00:00Z', matched: 0, version_mismatch: 0, unconfirmed: 0, untracked: 0, orphaned: 0, ignored: 0 },
    ])
    api.scanner.report.mockRejectedValue(new Error('Network error'))
    render(<ScannerPageShell section="matched" />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('scanner-retry-button')).toBeInTheDocument())
  })

  it('renders BulkActionBar for unconfirmed section', async () => {
    api.scanner.runs.mockResolvedValue([
      { scan_id: 's1', scanned_at: '2026-05-04T12:00:00Z', matched: 0, version_mismatch: 0, unconfirmed: 1, untracked: 0, orphaned: 0, ignored: 0 },
    ])
    api.scanner.report.mockResolvedValue({
      scan_id: 's1', scanned_at: '2026-05-04T12:00:00Z',
      matched: [], version_mismatch: [],
      unconfirmed: [{ result_id: 'r1', status: 'unconfirmed', name: 'Synth', vendor: 'V', version: '1', format: 'vst3', path: '/p', confidence: 'high', score: 90, matched_record: null, dismissed_at: null }],
      untracked: [], orphaned: [], ignored: [],
    })
    render(<ScannerPageShell section="unconfirmed" />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('confirm-all-high-confidence-button')).toBeInTheDocument())
  })
})
