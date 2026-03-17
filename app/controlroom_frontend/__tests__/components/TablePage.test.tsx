import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { TablePage } from '@/components/TablePage'

// useVirtualizer needs ResizeObserver in jsdom
globalThis.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

const mockApiList = jest.fn()

jest.mock('@/lib/api', () => ({
  api: { list: (...args: unknown[]) => mockApiList(...args) },
}))

jest.mock('@/lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}))

let mockUseAuth = () => ({ role: 'admin' as string })

type Row = { id: string; name: string }

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
]

const rows: Row[] = [{ id: '1', name: 'Alpha' }]

function renderPage(roleOverride?: string) {
  if (roleOverride !== undefined) {
    mockUseAuth = () => ({ role: roleOverride })
  } else {
    mockUseAuth = () => ({ role: 'admin' })
  }

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      <TablePage
        title="Test Table"
        endpoint="/test"
        queryKey="test"
        columns={columns}
        getRowId={(r) => r.id}
        renderModal={(record, onClose) => (
          <div data-testid="modal">
            {record === null ? 'create' : record?.name}
            <button onClick={onClose}>close-modal</button>
          </div>
        )}
      />
    </QueryClientProvider>
  )
}

describe('TablePage', () => {
  beforeEach(() => {
    mockApiList.mockResolvedValue(rows)
  })

  it('renders the page title', async () => {
    renderPage()
    expect(screen.getByText('Test Table')).toBeInTheDocument()
    await waitFor(() => screen.getByText('1 record'))
  })

  it('renders Add button for admin', async () => {
    renderPage('admin')
    await waitFor(() => screen.getByText('1 record'))
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument()
  })

  it('hides Add button for non-admin', async () => {
    renderPage('user')
    await waitFor(() => screen.getByText('1 record'))
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument()
  })

  it('opens create modal when Add is clicked', async () => {
    renderPage('admin')
    await waitFor(() => screen.getByText('1 record'))
    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    expect(screen.getByTestId('modal')).toBeInTheDocument()
    expect(screen.getByText('create')).toBeInTheDocument()
  })

  it('closes modal when onClose is called', async () => {
    renderPage('admin')
    await waitFor(() => screen.getByText('1 record'))
    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    expect(screen.getByTestId('modal')).toBeInTheDocument()
    fireEvent.click(screen.getByText('close-modal'))
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
  })

  it('shows plural record count', async () => {
    mockApiList.mockResolvedValue([...rows, { id: '2', name: 'Beta' }])
    renderPage()
    await waitFor(() => screen.getByText('2 records'))
  })

  it('shows error message when fetch fails', async () => {
    mockApiList.mockRejectedValue(new Error('Network error'))
    renderPage()
    await waitFor(() =>
      expect(screen.getByText(/Error loading data/i)).toBeInTheDocument()
    )
  })

  it('renders search input', async () => {
    renderPage()
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
  })
})
