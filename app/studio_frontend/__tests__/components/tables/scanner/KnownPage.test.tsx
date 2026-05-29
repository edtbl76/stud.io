import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { KnownPage } from '@/components/tables/scanner/KnownPage'
import { api } from '@/lib/api'
import type { WorkbenchRow, WorkbenchResponse } from '@/lib/types'

jest.mock('@/lib/auth', () => ({ useSession: () => ({ data: { user: { name: 'Test' } } }) }))
jest.mock('@/lib/api', () => ({
  api: {
    scanner: {
      workbench: jest.fn(),
    },
  },
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const mockWorkbench = api.scanner.workbench as jest.Mock

function makeKnownRow(overrides: Partial<WorkbenchRow> = {}): WorkbenchRow {
  return {
    result_id: 'r1',
    disk_name: 'Surge XT',
    disk_vendor: 'MNTRA',
    disk_version: '1.0',
    disk_format: 'VST3',
    disk_path: '/path/surge.vst3',
    display_name: 'Surge XT',
    display_vendor: 'MNTRA',
    catalog_record_id: 'cat-1',
    catalog_record_table: 'instruments',
    catalog_record_name: 'Surge XT',
    catalog_record_vendor: 'MNTRA',
    catalog_record_version: '1.0',
    bucket: 'known',
    confidence: 'exact',
    confirmed_at: '2026-05-28T10:00:00Z',
    confirmed_by: 'adminuser',
    ...overrides,
  }
}

const response = (rows: WorkbenchRow[]): WorkbenchResponse => ({
  rows,
  orphaned: [],
  scan_id: 'scan-1',
})

beforeEach(() => {
  jest.clearAllMocks()
})

// Step 9 — renders rows sorted by catalog type then name
describe('KnownPage row rendering and sort order', () => {
  it('renders a row for each known result', async () => {
    const rows = [makeKnownRow({ result_id: 'r1' }), makeKnownRow({ result_id: 'r2' })]
    mockWorkbench.mockResolvedValue(response(rows))
    render(<KnownPage />)
    await waitFor(() => {
      expect(screen.getAllByTestId('known-row')).toHaveLength(2)
    })
  })

  it('sorts rows by catalog_record_table then catalog_record_name', async () => {
    const rows = [
      makeKnownRow({ result_id: 'r1', catalog_record_table: 'instruments', catalog_record_name: 'Zebra' }),
      makeKnownRow({ result_id: 'r2', catalog_record_table: 'effects', catalog_record_name: 'Reverb' }),
      makeKnownRow({ result_id: 'r3', catalog_record_table: 'instruments', catalog_record_name: 'Analog Lab' }),
    ]
    mockWorkbench.mockResolvedValue(response(rows))
    render(<KnownPage />)
    await waitFor(() => {
      const renderedRows = screen.getAllByTestId('known-row')
      expect(renderedRows[0]).toHaveTextContent('Reverb')
      expect(renderedRows[1]).toHaveTextContent('Analog Lab')
      expect(renderedRows[2]).toHaveTextContent('Zebra')
    })
  })

  it('calls workbench with bucket known', async () => {
    mockWorkbench.mockResolvedValue(response([]))
    render(<KnownPage />)
    await waitFor(() => {
      expect(mockWorkbench).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'known' }))
    })
  })
})

// Step 10 — name cell is a catalog link
describe('KnownPage name cell link', () => {
  it('renders an anchor with data-testid known-row-link for known table', async () => {
    mockWorkbench.mockResolvedValue(response([makeKnownRow()]))
    render(<KnownPage />)
    await waitFor(() => {
      expect(screen.getByTestId('known-row-link')).toBeInTheDocument()
    })
  })

  it('name link href uses catalogRecordPath pattern', async () => {
    mockWorkbench.mockResolvedValue(response([
      makeKnownRow({ catalog_record_table: 'instruments', catalog_record_id: 'cat-42' }),
    ]))
    render(<KnownPage />)
    await waitFor(() => {
      const link = screen.getByTestId('known-row-link') as HTMLAnchorElement
      expect(link.href).toContain('/controlroom/session/instruments')
      expect(link.href).toContain('?open=cat-42')
    })
  })
})

// Step 11 — unknown table renders plain text (BR-09)
describe('KnownPage unknown catalog table fallback', () => {
  it('renders name as plain text when catalogRecordPath returns null', async () => {
    mockWorkbench.mockResolvedValue(response([
      makeKnownRow({ catalog_record_table: 'unknown_table', catalog_record_name: 'Mystery Plugin' }),
    ]))
    render(<KnownPage />)
    await waitFor(() => {
      expect(screen.queryByTestId('known-row-link')).toBeNull()
      expect(screen.getByText('Mystery Plugin')).toBeInTheDocument()
    })
  })
})

// Step 12 — empty state
describe('KnownPage empty state', () => {
  it('renders empty state when rows array is empty', async () => {
    mockWorkbench.mockResolvedValue(response([]))
    render(<KnownPage />)
    await waitFor(() => {
      expect(screen.getByTestId('known-empty-state')).toBeInTheDocument()
      expect(screen.queryByTestId('known-row')).toBeNull()
    })
  })
})

// Step 13 — loading and error states
describe('KnownPage loading state', () => {
  it('renders loading indicator while fetch is pending', () => {
    mockWorkbench.mockReturnValue(new Promise(() => undefined))
    render(<KnownPage />)
    expect(screen.getByTestId('known-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('known-row')).toBeNull()
  })
})

describe('KnownPage error state', () => {
  it('renders error alert when workbench fetch fails', async () => {
    mockWorkbench.mockRejectedValue(new Error('network error'))
    render(<KnownPage />)
    await waitFor(() => {
      expect(screen.getByTestId('known-error')).toBeInTheDocument()
    })
  })
})
