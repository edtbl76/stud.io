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
      acknowledge: jest.fn(),
      force: jest.fn(),
      catalogSearch: jest.fn(),
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

const BASE_STATUS_COUNTS = { matched: 0, conflicted: 0, unconfirmed: 0, untracked: 0, orphaned: 0, ignored: 0 }
const BASE_RUN = { scan_id: 's1', scanned_at: '2026-05-04T12:00:00Z', source_machine: 'test', total_count: 0, status_counts: BASE_STATUS_COUNTS, confirmation_counts: { confirmed: 0, rejected: 0, ignored: 0 } }
const BASE_REPORT = { scan_id: 's1', scanned_at: '2026-05-04T12:00:00Z', known: [], matched: [], conflicted: [], unconfirmed: [], untracked: [], orphaned: [], ignored: [] }

const MATCHED_RESULT = { result_id: 'r1', status: 'matched', name: 'Reverb Pro', vendor: 'Acme', version: '1.0', format: 'vst3', path: '/p', match: { confidence: 'exact', score: 100, record_id: 'rec1', record_table: 'effects', record_name: 'Reverb Pro Catalog', record_vendor: 'Acme', record_version: '1.0', catalog_disk_paths: [] }, dismissed_at: null, confirmed_at: null }
const KNOWN_RESULT = { ...MATCHED_RESULT, result_id: 'k1' }

function mockRun(statusOverrides: Partial<typeof BASE_STATUS_COUNTS> = {}) {
  api.scanner.runs.mockResolvedValue([{ ...BASE_RUN, status_counts: { ...BASE_STATUS_COUNTS, ...statusOverrides } }])
}
function mockReport(overrides = {}) {
  api.scanner.report.mockResolvedValue({ ...BASE_REPORT, ...overrides })
}

describe('ScannerPageShell', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows empty state when no scan runs exist', async () => {
    api.scanner.runs.mockResolvedValue([])
    render(<ScannerPageShell section="matched" />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('scanner-no-scans-state')).toBeInTheDocument())
  })

  it('renders matched results when report loads', async () => {
    mockRun({ matched: 1 })
    mockReport({ matched: [MATCHED_RESULT] })
    render(<ScannerPageShell section="matched" />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('matched-row-r1')).toBeInTheDocument())
  })

  it('renders known results in known section', async () => {
    mockRun({ matched: 1 })
    mockReport({ known: [KNOWN_RESULT] })
    render(<ScannerPageShell section="known" />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('matched-row-k1')).toBeInTheDocument())
  })

  it('shows section empty state when section has no results', async () => {
    mockRun()
    mockReport()
    render(<ScannerPageShell section="matched" />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('scanner-empty-state')).toBeInTheDocument())
  })

  it('shows retry button when report fails to load', async () => {
    mockRun()
    api.scanner.report.mockRejectedValue(new Error('Network error'))
    render(<ScannerPageShell section="matched" />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('scanner-retry-button')).toBeInTheDocument())
  })

  it('renders BulkActionBar for unconfirmed section', async () => {
    mockRun({ unconfirmed: 1 })
    const unconfirmedResult = { result_id: 'r1', status: 'unconfirmed', name: 'Synth', vendor: 'V', version: '1', format: 'vst3', path: '/p', match: { confidence: 'high', score: 90, record_id: null, record_table: null, record_name: null, record_vendor: null, record_version: null, catalog_disk_paths: [] }, dismissed_at: null, confirmed_at: null }
    mockReport({ unconfirmed: [unconfirmedResult] })
    render(<ScannerPageShell section="unconfirmed" />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('confirm-all-high-confidence-button')).toBeInTheDocument())
  })

  it('renders ConflictedSectionHeader for conflicted section', async () => {
    mockRun({ conflicted: 1 })
    const conflictedResult = { result_id: 'c1', status: 'conflicted', name: 'Comp Z', vendor: 'DynCo', version: '1.0', format: 'vst3', path: '/p', match: { confidence: 'exact', score: 100, record_id: 'rec2', record_table: 'effects', record_name: 'Comp Z', record_vendor: 'DynCo', record_version: '2.0', catalog_disk_paths: [] }, dismissed_at: null, confirmed_at: null }
    mockReport({ conflicted: [conflictedResult] })
    render(<ScannerPageShell section="conflicted" />, { wrapper })
    await waitFor(() => expect(screen.getByText('Conflicted')).toBeInTheDocument())
  })
})
