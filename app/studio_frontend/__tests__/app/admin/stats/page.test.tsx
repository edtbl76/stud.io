import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import StatsPage from '@/app/admin/stats/page'

const mockFetch = jest.fn()
global.fetch = mockFetch

// Mock counts: Catalog 111, Session 917, Tools 63, Config 76 → total 1,167
const mockStatsResponse = {
  groups: [
    {
      label: 'Catalog',
      tables: [
        { name: 'Models', count: 87, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Brands', count: 24, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
      ],
    },
    {
      label: 'Session',
      tables: [
        { name: 'Libraries', count: 401, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Effects', count: 312, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Instruments', count: 198, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Workstations', count: 6, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
      ],
    },
    {
      label: 'Tools',
      tables: [
        { name: 'Workflow', count: 22, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Admin', count: 14, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Measurement', count: 11, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Composition', count: 9, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Reference', count: 7, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
      ],
    },
    {
      label: 'Config',
      tables: [
        { name: 'Tag Types', count: 23, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Effect Types', count: 18, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Instrument Types', count: 12, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Tool Types', count: 8, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Model Types', count: 6, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Plugin Formats', count: 5, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Entity Types', count: 4, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
      ],
    },
  ],
  total: 1167,
}

const mockStatsWithPendingResponse = {
  groups: [
    {
      label: 'Catalog',
      tables: [
        { name: 'Brands', count: 24, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        {
          name: 'Models',
          count: 86,           // 87 active - 1 pending create + 0 pending deletes
          pending_creates: 1,
          pending_deletes: 0,
          pending_updates: 0,
        },
      ],
    },
    {
      label: 'Session',
      tables: [
        {
          name: 'Effects',
          count: 313,          // 312 active + 1 pending delete
          pending_creates: 0,
          pending_deletes: 1,
          pending_updates: 0,
        },
        {
          name: 'Instruments',
          count: 198,
          pending_creates: 0,
          pending_deletes: 0,
          pending_updates: 2,
        },
        { name: 'Libraries', count: 401, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Workstations', count: 6, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
      ],
    },
    {
      label: 'Tools',
      tables: [
        { name: 'Workflow', count: 22, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Admin', count: 14, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Measurement', count: 11, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Composition', count: 9, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Reference', count: 7, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
      ],
    },
    {
      label: 'Config',
      tables: [
        { name: 'Tag Types', count: 23, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Effect Types', count: 18, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Instrument Types', count: 12, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Tool Types', count: 8, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Model Types', count: 6, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Plugin Formats', count: 5, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
        { name: 'Entity Types', count: 4, pending_creates: 0, pending_deletes: 0, pending_updates: 0 },
      ],
    },
  ],
  total: 1167,
}

function mockOk(data: object) {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  }
}

function mockErr(detail: string, status = 500) {
  return {
    ok: false,
    status,
    statusText: detail,
    json: () => Promise.resolve({ detail }),
  }
}

describe('StatsPage', () => {
  beforeEach(() => mockFetch.mockReset())

  it('renders all 4 group labels after fetch', async () => {
    mockFetch.mockResolvedValue(mockOk(mockStatsResponse))
    render(<StatsPage />)
    await waitFor(() => expect(screen.getByText('Catalog')).toBeInTheDocument())
    expect(screen.getByText('Session')).toBeInTheDocument()
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('Config')).toBeInTheDocument()
  })

  it('renders table display names', async () => {
    mockFetch.mockResolvedValue(mockOk(mockStatsResponse))
    render(<StatsPage />)
    await waitFor(() => expect(screen.getByText('Models')).toBeInTheDocument())
    expect(screen.getByText('Libraries')).toBeInTheDocument()
    expect(screen.getByText('Tag Types')).toBeInTheDocument()
  })

  it('renders comma-formatted total', async () => {
    mockFetch.mockResolvedValue(mockOk(mockStatsResponse))
    render(<StatsPage />)
    await waitFor(() =>
      expect(screen.getByText('1,167')).toBeInTheDocument()
    )
  })

  it('shows Loader2 spinner while fetch is in flight', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    render(<StatsPage />)
    // Loader2 is aliased to LoaderCircle in lucide-react ≥0.469 and renders with class lucide-loader-circle
    expect(document.querySelector('.lucide-loader-circle')).toBeInTheDocument()
  })

  it('shows error message when API returns non-OK response', async () => {
    mockFetch.mockResolvedValue(mockErr('Unauthorized', 401))
    render(<StatsPage />)
    await waitFor(() =>
      expect(screen.getByText(/could not load stats/i)).toBeInTheDocument()
    )
  })

  it('shows pending creation annotation', async () => {
    mockFetch.mockResolvedValue(mockOk(mockStatsWithPendingResponse))
    render(<StatsPage />)
    await waitFor(() =>
      expect(screen.getByText(/1 pending addition/i)).toBeInTheDocument()
    )
  })

  it('shows pending deletion annotation', async () => {
    mockFetch.mockResolvedValue(mockOk(mockStatsWithPendingResponse))
    render(<StatsPage />)
    await waitFor(() =>
      expect(screen.getByText(/1 pending deletion/i)).toBeInTheDocument()
    )
  })

  it('shows pending update annotation without changing count', async () => {
    mockFetch.mockResolvedValue(mockOk(mockStatsWithPendingResponse))
    render(<StatsPage />)
    await waitFor(() =>
      expect(screen.getByText(/2 pending updates/i)).toBeInTheDocument()
    )
  })
})
