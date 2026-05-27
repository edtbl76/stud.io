import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ScanReportPage } from '@/components/tables/scanner/report/ScanReportPage'
import { api } from '@/lib/api'
import type { ScanListItem, RawScanReport } from '@/lib/types'

jest.mock('@/lib/auth', () => ({ useSession: () => ({ data: { user: { name: 'Test' } } }) }))
jest.mock('@/lib/api', () => ({
  api: {
    scanner: {
      recentScans: jest.fn(),
      rawReport: jest.fn(),
    },
  },
}))

const mockRecentScans = api.scanner.recentScans as jest.Mock
const mockRawReport = api.scanner.rawReport as jest.Mock

const scan1: ScanListItem = {
  scan_id: 'scan-1',
  scanned_at: '2026-05-25T14:32:00.000Z',
  source_machine: "Edward's Mac Studio",
  total_count: 847,
}

const scan2: ScanListItem = {
  scan_id: 'scan-2',
  scanned_at: '2026-05-24T10:00:00.000Z',
  source_machine: "Edward's Mac Studio",
  total_count: 200,
}

const report1: RawScanReport = {
  scan_id: 'scan-1',
  scanned_at: '2026-05-25T14:32:00.000Z',
  results_by_status: {
    known: [
      { result_id: 'r-1', name: 'Surge XT', vendor: 'Surge Synth Team', version: '3.3.4', format: 'VST3', path: '/plug-ins/Surge XT.vst3', status: 'known', confidence: 'exact' },
    ],
    untracked: [],
  },
}

const report2: RawScanReport = {
  scan_id: 'scan-2',
  scanned_at: '2026-05-24T10:00:00.000Z',
  results_by_status: { matched: [] },
}

beforeEach(() => {
  jest.clearAllMocks()
})

// Step 7: On mount, fetches recent scans and sets picker options
describe('scan list loading', () => {
  it('calls recentScans on mount', async () => {
    mockRecentScans.mockResolvedValue([scan1])
    mockRawReport.mockResolvedValue(report1)
    render(<ScanReportPage />)
    await waitFor(() => expect(mockRecentScans).toHaveBeenCalledTimes(1))
  })
})

// Step 8: Auto-selects first scan and fetches its report
describe('auto-selection', () => {
  it('fetches report for first scan automatically', async () => {
    mockRecentScans.mockResolvedValue([scan1, scan2])
    mockRawReport.mockResolvedValue(report1)
    render(<ScanReportPage />)
    await waitFor(() => expect(mockRawReport).toHaveBeenCalledWith('scan-1'))
  })
})

// Step 9: Shows empty state when no scans exist
describe('empty state', () => {
  it('shows empty state when no scans returned', async () => {
    mockRecentScans.mockResolvedValue([])
    render(<ScanReportPage />)
    await waitFor(() => expect(screen.getByTestId('report-empty-state')).toBeInTheDocument())
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})

// Step 10: Picker label format
describe('picker label format', () => {
  it('includes source_machine and total_count in picker option', async () => {
    mockRecentScans.mockResolvedValue([scan1])
    mockRawReport.mockResolvedValue(report1)
    render(<ScanReportPage />)
    await waitFor(() => screen.getByText(/Edward's Mac Studio/))
    expect(screen.getByText(/847 results/)).toBeInTheDocument()
  })
})

// Step 11: Changing picker selection fetches new report
describe('scan switching', () => {
  it('fetches report for newly selected scan', async () => {
    mockRecentScans.mockResolvedValue([scan1, scan2])
    mockRawReport.mockResolvedValueOnce(report1).mockResolvedValueOnce(report2)
    render(<ScanReportPage />)
    await waitFor(() => expect(mockRawReport).toHaveBeenCalledWith('scan-1'))

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'scan-2' } })
    await waitFor(() => expect(mockRawReport).toHaveBeenCalledWith('scan-2'))
  })
})

// Step 12: Accordion renders one section per status key
describe('accordion sections', () => {
  it('renders a section for each status key in results_by_status', async () => {
    mockRecentScans.mockResolvedValue([scan1])
    mockRawReport.mockResolvedValue(report1)
    render(<ScanReportPage />)
    await waitFor(() => screen.getByText(/Known/i))
    expect(screen.getByText(/Untracked/i)).toBeInTheDocument()
  })
})

// Step 13: Canonical status order
describe('canonical order', () => {
  it('displays known before untracked regardless of dict order', async () => {
    const reportUnordered: RawScanReport = {
      scan_id: 'scan-1',
      scanned_at: '2026-05-25T14:32:00.000Z',
      results_by_status: { untracked: [], known: [] },
    }
    mockRecentScans.mockResolvedValue([scan1])
    mockRawReport.mockResolvedValue(reportUnordered)
    render(<ScanReportPage />)
    await waitFor(() => screen.getByText(/Known/i))
    const sections = screen.getAllByRole('button')
    const knownIdx = sections.findIndex(b => b.textContent?.includes('Known'))
    const untrackedIdx = sections.findIndex(b => b.textContent?.includes('Untracked'))
    expect(knownIdx).toBeLessThan(untrackedIdx)
  })
})

// Step 14: Zero-count section is shown
describe('zero-count sections', () => {
  it('shows section with 0 results when key is present in response', async () => {
    mockRecentScans.mockResolvedValue([scan1])
    mockRawReport.mockResolvedValue(report1)
    render(<ScanReportPage />)
    await waitFor(() => screen.getByText(/Untracked/i))
    expect(screen.getByText(/Untracked \(0\)/i)).toBeInTheDocument()
  })
})

// Step 15: All sections start collapsed
describe('collapsed by default', () => {
  it('does not show report rows before expanding a section', async () => {
    mockRecentScans.mockResolvedValue([scan1])
    mockRawReport.mockResolvedValue(report1)
    render(<ScanReportPage />)
    await waitFor(() => screen.getByText(/Known/i))
    expect(screen.queryByTestId('report-row')).not.toBeInTheDocument()
  })
})

// Step 16: Expanding a section shows ReportRows
describe('expand section', () => {
  it('shows report rows after clicking section header', async () => {
    mockRecentScans.mockResolvedValue([scan1])
    mockRawReport.mockResolvedValue(report1)
    render(<ScanReportPage />)
    await waitFor(() => screen.getByText(/Known/i))
    fireEvent.click(screen.getByText(/Known/i))
    await waitFor(() => expect(screen.getByTestId('report-row')).toBeInTheDocument())
  })
})

// Step 17: Loading state
describe('loading state', () => {
  it('shows loading indicator while report is fetching', async () => {
    mockRecentScans.mockResolvedValue([scan1])
    mockRawReport.mockReturnValue(new Promise(() => {}))
    render(<ScanReportPage />)
    await waitFor(() => expect(screen.getByTestId('report-loading')).toBeInTheDocument())
  })
})

// Step 18: Error state
describe('error state', () => {
  it('shows error alert when rawReport rejects', async () => {
    mockRecentScans.mockResolvedValue([scan1])
    mockRawReport.mockRejectedValue(new Error('Network error'))
    render(<ScanReportPage />)
    await waitFor(() => expect(screen.getByTestId('report-error')).toBeInTheDocument())
    expect(screen.queryByTestId('report-loading')).not.toBeInTheDocument()
  })
})
