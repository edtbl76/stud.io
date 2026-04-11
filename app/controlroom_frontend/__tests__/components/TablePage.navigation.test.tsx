import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { TablePage } from '@/components/TablePage'
import { RecordModalNavigation } from '@/components/RecordModal'
import type { RecordNavigationValue } from '@/lib/useRecordNavigation'

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
    listPaged: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    update: jest.fn().mockResolvedValue({}),
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}))

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ role: 'admin' }),
}))

type Row = { id: string; name: string }

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
]

const rows: Row[] = [
  { id: '1', name: 'Alpha' },
  { id: '2', name: 'Beta' },
  { id: '3', name: 'Gamma' },
]

// Reads from RecordModalNavigation context to expose nav state in the DOM.
// Mirrors the buttons RecordModal renders so tests can find them by aria-label.
// Defined at module level so it's a stable reference and never re-created.
function NavAwareStub({ onClose }: { onClose: () => void }) {
  const nav = React.useContext(RecordModalNavigation)
  return (
    <div data-testid="modal">
      {nav !== null && (
        <>
          <span data-testid="nav-position">{nav.index + 1} of {nav.total}</span>
          <button
            onClick={nav.onPrev}
            disabled={!nav.hasPrev}
            aria-label="Previous record"
          >
            &larr;
          </button>
          <button
            onClick={nav.onNext}
            disabled={!nav.hasNext}
            aria-label="Next record"
          >
            &rarr;
          </button>
        </>
      )}
      <button onClick={onClose}>close-modal</button>
    </div>
  )
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      <TablePage
        title="Nav Table"
        endpoint="/test"
        queryKey="test-nav"
        columns={columns}
        getRowId={(r) => r.id}
        renderModal={(_record, onClose) => <NavAwareStub onClose={onClose} />}
      />
    </QueryClientProvider>
  )
}

describe('TablePage navigation context', () => {
  beforeEach(() => {
    mockApiList.mockResolvedValue(rows)
    mockRouterReplace.mockClear()
    mockGetSearchParam = (_key: string) => null
  })

  it('supplies nav context when a middle record is opened', async () => {
    renderPage()
    await waitFor(() => screen.getByText('3 records'))

    // Click the second row (Beta) — it has prev and next
    const cells = screen.getAllByRole('cell')
    // Each row has 2 cells (id, name); second row starts at index 2
    fireEvent.click(cells[2])

    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument())
    expect(screen.getByTestId('nav-position')).toHaveTextContent('2 of 3')
  })

  it('supplies nav context when the first record is opened', async () => {
    renderPage()
    await waitFor(() => screen.getByText('3 records'))

    const cells = screen.getAllByRole('cell')
    fireEvent.click(cells[0])

    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument())
    expect(screen.getByTestId('nav-position')).toHaveTextContent('1 of 3')
  })

  it('updates nav position when next button is clicked', async () => {
    renderPage()
    await waitFor(() => screen.getByText('3 records'))

    const cells = screen.getAllByRole('cell')
    fireEvent.click(cells[0])

    await waitFor(() => expect(screen.getByTestId('nav-position')).toHaveTextContent('1 of 3'))

    const nextBtn = screen.getByRole('button', { name: /next record/i })
    fireEvent.click(nextBtn)

    await waitFor(() => expect(screen.getByTestId('nav-position')).toHaveTextContent('2 of 3'))
  })

  it('disables prev button on first record', async () => {
    renderPage()
    await waitFor(() => screen.getByText('3 records'))

    const cells = screen.getAllByRole('cell')
    fireEvent.click(cells[0])

    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /previous record/i })).toBeDisabled()
  })

  it('disables next button on last record', async () => {
    renderPage()
    await waitFor(() => screen.getByText('3 records'))

    const cells = screen.getAllByRole('cell')
    // Third row starts at index 4 (0,1 = row1, 2,3 = row2, 4,5 = row3)
    fireEvent.click(cells[4])

    await waitFor(() => expect(screen.getByTestId('nav-position')).toHaveTextContent('3 of 3'))
    expect(screen.getByRole('button', { name: /next record/i })).toBeDisabled()
  })

  it('closes modal when onClose is called', async () => {
    renderPage()
    await waitFor(() => screen.getByText('3 records'))

    const cells = screen.getAllByRole('cell')
    fireEvent.click(cells[0])

    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument())
    fireEvent.click(screen.getByText('close-modal'))
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
  })
})

describe('TablePage navigation context — RecordNavigationValue shape', () => {
  beforeEach(() => {
    mockApiList.mockResolvedValue(rows)
  })

  it('does not render nav strip when creating a new record (null selectedRecord)', async () => {
    renderPage()
    await waitFor(() => screen.getByText('3 records'))

    fireEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() => expect(screen.getByTestId('modal')).toBeInTheDocument())
    // nav context is null for new records — no nav-position element
    expect(screen.queryByTestId('nav-position')).not.toBeInTheDocument()
  })
})
