import * as React from 'react'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { TablePage } from '@/components/TablePage'
import type { BulkEditField } from '@/lib/bulkEdit'

// useVirtualizer needs ResizeObserver in jsdom
globalThis.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// useVirtualizer returns 0 items in jsdom (no real scroll dimensions).
// Mock it to always render all rows so row cells are visible in tests.
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => {
    const size = estimateSize()
    return {
      getVirtualItems: () =>
        Array.from({ length: count }, (_, i) => ({
          index: i,
          start: i * size,
          end: (i + 1) * size,
          size,
          key: i,
          lane: 0,
        })),
      getTotalSize: () => count * size,
    }
  },
}))

const mockApiList = jest.fn()
const mockApiUpdate = jest.fn()
const mockApiListPaged = jest.fn()
const mockApiGet = jest.fn()
const mockRouterReplace = jest.fn()
let mockGetSearchParam = (_key: string): string | null => null

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => mockGetSearchParam(key) }),
  usePathname: () => '/test',
  useRouter: () => ({ replace: mockRouterReplace }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    list: (...args: unknown[]) => mockApiList(...args),
    listPaged: (...args: unknown[]) => mockApiListPaged(...args),
    update: (...args: unknown[]) => mockApiUpdate(...args),
    get: (...args: unknown[]) => mockApiGet(...args),
  },
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

const rows: Row[] = [{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }]

const bulkEditFields: BulkEditField[] = [
  { key: 'name', label: 'Name', type: 'text' },
]

function renderPagedPage(roleOverride?: string) {
  mockUseAuth = () => ({ role: roleOverride ?? 'admin' })

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      <TablePage
        title="Paged Table"
        endpoint="/test"
        queryKey="test-paged"
        columns={columns}
        getRowId={(r) => r.id}
        renderModal={(record, onClose) => (
          <div data-testid="modal">
            {record === null ? 'create' : record?.name}
            <button onClick={onClose}>close-modal</button>
          </div>
        )}
        paginated
      />
    </QueryClientProvider>
  )
}

function renderPage(roleOverride?: string, withBulkEdit = false) {
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
        bulkEditFields={withBulkEdit ? bulkEditFields : undefined}
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
    await waitFor(() => screen.getByText('2 records'))
  })

  it('renders Add button for admin', async () => {
    renderPage('admin')
    await waitFor(() => screen.getByText('2 records'))
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument()
  })

  it('hides Add button for non-admin', async () => {
    renderPage('user')
    await waitFor(() => screen.getByText('2 records'))
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument()
  })

  it('opens create modal when Add is clicked', async () => {
    renderPage('admin')
    await waitFor(() => screen.getByText('2 records'))
    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument())
    expect(screen.getByText('create')).toBeInTheDocument()
  })

  it('closes modal when onClose is called', async () => {
    renderPage('admin')
    await waitFor(() => screen.getByText('2 records'))
    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument())
    fireEvent.click(screen.getByText('close-modal'))
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
  })

  it('shows plural record count', async () => {
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

})

describe('TablePage bulk edit', () => {
  beforeEach(() => {
    mockApiList.mockResolvedValue(rows)
    mockApiUpdate.mockResolvedValue({})
  })

  it('shows checkbox column for admin with bulkEditFields', async () => {
    renderPage('admin', true)
    await waitFor(() => screen.getByText('2 records'))
    expect(screen.getByLabelText('Select all')).toBeInTheDocument()
  })

  it('does not show checkbox column without bulkEditFields', async () => {
    renderPage('admin', false)
    await waitFor(() => screen.getByText('2 records'))
    expect(screen.queryByLabelText('Select all')).not.toBeInTheDocument()
  })

  it('does not show checkbox column for non-admin', async () => {
    renderPage('user', true)
    await waitFor(() => screen.getByText('2 records'))
    expect(screen.queryByLabelText('Select all')).not.toBeInTheDocument()
  })

  it('shows bulk edit bar when rows are selected', async () => {
    renderPage('admin', true)
    await waitFor(() => screen.getByText('2 records'))
    const checkboxes = screen.getAllByRole('checkbox')
    // First checkbox is "select all", rest are per-row
    fireEvent.click(checkboxes[1])
    const bar = screen.getByTestId('bulk-edit-bar')
    expect(bar).toBeInTheDocument()
    expect(within(bar).getByText('1')).toBeInTheDocument()
  })

  it('hides bulk edit bar when selection is cleared', async () => {
    renderPage('admin', true)
    await waitFor(() => screen.getByText('2 records'))
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])
    expect(screen.getByTestId('bulk-edit-bar')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Clear selection'))
    expect(screen.queryByTestId('bulk-edit-bar')).not.toBeInTheDocument()
  })

  it('select-all checkbox selects all visible rows', async () => {
    renderPage('admin', true)
    await waitFor(() => screen.getByText('2 records'))
    const selectAll = screen.getByLabelText('Select all')
    fireEvent.click(selectAll)
    const bar = screen.getByTestId('bulk-edit-bar')
    expect(bar).toBeInTheDocument()
    expect(within(bar).getByText('2')).toBeInTheDocument()
  })

  it('clears bulk selection after apply completes', async () => {
    renderPage('admin', true)
    await waitFor(() => screen.getByText('2 records'))

    fireEvent.click(screen.getByLabelText('Select all'))
    expect(screen.getByTestId('bulk-edit-bar')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), {
      target: { value: 'name' },
    })
    fireEvent.change(screen.getByPlaceholderText('Set Name…'), {
      target: { value: 'Updated' },
    })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() => expect(mockApiUpdate).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(screen.queryByTestId('bulk-edit-bar')).not.toBeInTheDocument()
    )
  })
})

describe('TablePage row interaction', () => {
  beforeEach(() => {
    mockApiList.mockResolvedValue(rows)
  })

  it('clicking a row opens its modal', async () => {
    renderPage('admin')
    await waitFor(() => screen.getByText('2 records'))

    // Click on first data cell (td) — event bubbles to the tr onClick handler
    const cells = screen.getAllByRole('cell')
    fireEvent.click(cells[0])

    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument())
  })
})

describe('TablePage ?open deep-link', () => {
  beforeEach(() => {
    mockApiList.mockResolvedValue(rows)
    mockRouterReplace.mockClear()
  })

  afterEach(() => {
    mockGetSearchParam = (_key: string) => null
  })

  it('fetches and opens the record when ?open=<id> is present', async () => {
    mockGetSearchParam = (key) => (key === 'open' ? '1' : null)
    mockApiGet.mockResolvedValue({ id: '1', name: 'Alpha' })
    renderPage('admin')
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/test', '1'))
    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument())
  })

  it('clears the ?open param after opening', async () => {
    mockGetSearchParam = (key) => (key === 'open' ? '1' : null)
    mockApiGet.mockResolvedValue({ id: '1', name: 'Alpha' })
    renderPage('admin')
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/test', { scroll: false }))
  })
})

describe('TablePage paginated', () => {
  beforeEach(() => {
    // total equals items loaded so getNextPageParam returns undefined (no more pages)
    mockApiListPaged.mockResolvedValue({ items: rows, total: 2 })
    mockApiListPaged.mockClear()
    mockApiList.mockClear()
    mockApiList.mockResolvedValue([])
  })

  it('calls api.listPaged instead of api.list', async () => {
    renderPagedPage()
    await waitFor(() => expect(mockApiListPaged).toHaveBeenCalled())
    expect(mockApiList).not.toHaveBeenCalled()
  })

  it('shows server total record count', async () => {
    renderPagedPage()
    await waitFor(() => screen.getByText('2 records'))
  })

  it('renders rows from paged data', async () => {
    renderPagedPage()
    await waitFor(() => screen.getByText('Alpha'))
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('passes sort params to api.listPaged', async () => {
    renderPagedPage()
    await waitFor(() => expect(mockApiListPaged).toHaveBeenCalled())
    const firstCall = mockApiListPaged.mock.calls[0][1]
    expect(firstCall).toMatchObject({ limit: 100, offset: 0 })
  })
})

describe('TablePage paginated filter integration', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockApiListPaged.mockResolvedValue({ items: rows, total: 2 })
    mockApiListPaged.mockClear()
    mockApiList.mockClear()
    mockApiList.mockResolvedValue([])
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('passes filter params to api.listPaged after debounce', async () => {
    renderPagedPage()
    // Flush initial load
    await act(async () => { jest.advanceTimersByTime(0) })
    await waitFor(() => expect(mockApiListPaged).toHaveBeenCalled())
    mockApiListPaged.mockClear()

    const inputs = screen.getAllByPlaceholderText('2+ chars…')
    // 'name' column is the second column (after 'id')
    const nameInput = inputs.find(
      (el) => el.closest('th')?.style.width === '150px' || inputs.indexOf(el) === 1
    ) ?? inputs[0]

    fireEvent.change(nameInput, { target: { value: 'al' } })
    // Before debounce: no new call
    expect(mockApiListPaged).not.toHaveBeenCalled()

    await act(async () => { jest.advanceTimersByTime(350) })
    await waitFor(() => expect(mockApiListPaged).toHaveBeenCalled())

    const lastCall = mockApiListPaged.mock.calls.at(-1)![1]
    expect(lastCall.filters).toBeDefined()
  })

  it('does not refetch when input is shorter than 2 chars', async () => {
    renderPagedPage()
    await act(async () => { jest.advanceTimersByTime(0) })
    await waitFor(() => expect(mockApiListPaged).toHaveBeenCalled())
    const initialCallCount = mockApiListPaged.mock.calls.length

    const inputs = screen.getAllByPlaceholderText('2+ chars…')
    fireEvent.change(inputs[0], { target: { value: 'a' } })
    await act(async () => { jest.advanceTimersByTime(350) })

    // activeFilters stays empty so resolvedFilters doesn't change — no new fetch
    expect(mockApiListPaged.mock.calls.length).toBe(initialCallCount)
  })
})
