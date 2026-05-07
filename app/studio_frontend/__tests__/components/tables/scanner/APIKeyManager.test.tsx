import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { APIKeyManager } from '@/components/tables/scanner/APIKeyManager'

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ username: 'admin', role: 'admin' }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    scanner: {
      listKeys: jest.fn(),
      createKey: jest.fn(),
      revokeKey: jest.fn(),
    },
  },
}))

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))

const { api } = jest.requireMock('@/lib/api') as { api: { scanner: Record<string, jest.Mock> } }

const ACTIVE_KEY = {
  key_id: 'k1', label: 'ci-runner', key_hint: 'abcd',
  created_at: '2026-05-01T00:00:00Z', revoked_at: null,
}
const REVOKED_KEY = {
  key_id: 'k2', label: 'old-key', key_hint: 'zzzz',
  created_at: '2026-04-01T00:00:00Z', revoked_at: '2026-04-15T00:00:00Z',
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  jest.clearAllMocks()
  api.scanner.listKeys.mockResolvedValue([ACTIVE_KEY, REVOKED_KEY])
})

describe('APIKeyManager', () => {
  it('renders active keys and hides revoked by default', async () => {
    render(<APIKeyManager />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('key-row-k1')).toBeInTheDocument())
    expect(screen.queryByTestId('key-row-k2')).not.toBeInTheDocument()
  })

  it('shows revoked keys when toggle is clicked', async () => {
    render(<APIKeyManager />, { wrapper })
    await waitFor(() => screen.getByTestId('key-row-k1'))
    fireEvent.click(screen.getByTestId('show-revoked-toggle'))
    expect(screen.getByTestId('key-row-k2')).toBeInTheDocument()
  })

  it('opens revoke confirm modal when revoke button clicked', async () => {
    render(<APIKeyManager />, { wrapper })
    await waitFor(() => screen.getByTestId(`revoke-button-k1`))
    fireEvent.click(screen.getByTestId('revoke-button-k1'))
    expect(screen.getByTestId('revoke-confirm-modal')).toBeInTheDocument()
  })

  it('generates key and shows NewKeyModal', async () => {
    api.scanner.createKey.mockResolvedValue({
      key_id: 'k3', label: 'new-key', key: 'psc_' + 'b'.repeat(64), key_hint: 'bbbb',
      created_at: '2026-05-06T00:00:00Z', revoked_at: null,
    })
    render(<APIKeyManager />, { wrapper })
    await waitFor(() => screen.getByTestId('generate-key-button'))
    fireEvent.click(screen.getByTestId('generate-key-button'))
    await waitFor(() => expect(screen.getByTestId('new-key-modal')).toBeInTheDocument())
  })

  it('shows error toast and no modal when createKey fails', async () => {
    const { toast } = jest.requireMock('sonner') as { toast: { error: jest.Mock } }
    api.scanner.createKey.mockRejectedValue(new Error('generate failed'))
    render(<APIKeyManager />, { wrapper })
    await waitFor(() => screen.getByTestId('generate-key-button'))
    fireEvent.click(screen.getByTestId('generate-key-button'))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.queryByTestId('new-key-modal')).not.toBeInTheDocument()
  })

  it('shows empty state when no keys exist', async () => {
    api.scanner.listKeys.mockResolvedValue([])
    render(<APIKeyManager />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('key-list-empty')).toBeInTheDocument())
  })

  it('shows error toast when listKeys fails', async () => {
    const { toast } = jest.requireMock('sonner') as { toast: { error: jest.Mock } }
    api.scanner.listKeys.mockRejectedValue(new Error('server error'))
    render(<APIKeyManager />, { wrapper })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('server error')))
  })
})
