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
        { name: 'Models', count: 87 },
        { name: 'Brands', count: 24 },
      ],
    },
    {
      label: 'Session',
      tables: [
        { name: 'Libraries', count: 401 },
        { name: 'Effects', count: 312 },
        { name: 'Instruments', count: 198 },
        { name: 'Workstations', count: 6 },
      ],
    },
    {
      label: 'Tools',
      tables: [
        { name: 'Workflow', count: 22 },
        { name: 'Admin', count: 14 },
        { name: 'Measurement', count: 11 },
        { name: 'Composition', count: 9 },
        { name: 'Reference', count: 7 },
      ],
    },
    {
      label: 'Config',
      tables: [
        { name: 'Tag Types', count: 23 },
        { name: 'Effect Types', count: 18 },
        { name: 'Instrument Types', count: 12 },
        { name: 'Tool Types', count: 8 },
        { name: 'Model Types', count: 6 },
        { name: 'Plugin Formats', count: 5 },
        { name: 'Entity Types', count: 4 },
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
})
