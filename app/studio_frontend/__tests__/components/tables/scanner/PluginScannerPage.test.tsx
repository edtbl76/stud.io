import * as React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PluginScannerPage from '@/app/studio/admin/plugin-scanner/page'

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ username: 'admin', role: 'admin' }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    scanner: {
      listKeys: jest.fn().mockResolvedValue([]),
      createKey: jest.fn(),
      revokeKey: jest.fn(),
    },
  },
}))

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))

const mockFetch = jest.fn()
global.fetch = mockFetch

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('PluginScannerPage', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders page heading', async () => {
    mockFetch.mockResolvedValueOnce({ status: 204, json: async () => null } as unknown as Response)
    render(<PluginScannerPage />, { wrapper })
    expect(screen.getByTestId('plugin-scanner-page')).toBeInTheDocument()
    expect(screen.getByText('Plugin Scanner')).toBeInTheDocument()
  })

  it('hides download section when no release exists (204)', async () => {
    mockFetch.mockResolvedValueOnce({ status: 204, json: async () => null } as unknown as Response)
    render(<PluginScannerPage />, { wrapper })
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/scanner/download/latest'))
    expect(screen.queryByTestId('download-section')).not.toBeInTheDocument()
  })

  function mockLatestRelease() {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        key: 'plugin-scanner/plugin-scanner-v1.0.0-20260501T000000Z-darwin-arm64.zip',
        version: 'v1.0.0',
        released_at: '2026-05-01T00:00:00Z',
        size_bytes: 12345678,
      }),
    } as unknown as Response)
  }

  it('shows latest release card when release exists', async () => {
    mockLatestRelease()
    render(<PluginScannerPage />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('latest-release-card')).toBeInTheDocument())
    expect(screen.getByTestId('download-button')).toBeInTheDocument()
  })

  it('shows release history toggle when download section is visible', async () => {
    mockLatestRelease()
    render(<PluginScannerPage />, { wrapper })
    await waitFor(() => screen.getByTestId('release-history-toggle'))
    expect(screen.getByTestId('release-history-toggle')).toBeInTheDocument()
  })

  it('loads history lazily when toggle clicked', async () => {
    mockFetch
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          key: 'plugin-scanner/v2.zip', version: 'v2.0.0',
          released_at: '2026-05-06T00:00:00Z', size_bytes: 2000,
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        json: async () => [{ key: 'plugin-scanner/v1.zip', version: 'v1.0.0', released_at: '2026-05-01T00:00:00Z', size_bytes: 1000 }],
      } as unknown as Response)

    render(<PluginScannerPage />, { wrapper })
    await waitFor(() => screen.getByTestId('release-history-toggle'))
    fireEvent.click(screen.getByTestId('release-history-toggle'))
    await waitFor(() => screen.getByTestId('release-history-list'))
    expect(mockFetch).toHaveBeenCalledWith('/api/scanner/download/history')
  })
})
