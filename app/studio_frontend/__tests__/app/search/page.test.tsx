import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SearchPage from '@/app/controlroom/search/page'
import type { SearchResult } from '@/lib/types'

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ username: 'admin', role: 'admin' }),
}))

const mockSearchGlobal = jest.fn()
let mockGetSearchParam = (_key: string): string | null => null
const mockRouterReplace = jest.fn()
const mockRouterPush = jest.fn()

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => mockGetSearchParam(key) }),
  usePathname: () => '/search',
  useRouter: () => ({ replace: mockRouterReplace, push: mockRouterPush }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    searchGlobal: (...args: unknown[]) => mockSearchGlobal(...args),
  },
}))

jest.mock('@/components/SearchRecordModal', () => ({
  SearchRecordModal: ({ result, onClose }: { result: SearchResult; onClose: () => void }) => (
    <div data-testid="search-record-modal" data-result-id={result.id}>
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}))

const EFFECTS_RESULT = {
  table: 'effects',
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  name: 'Reverb Pro',
  brand_name: 'Acme Corp',
  rank: 0.9,
}

const BRANDS_RESULT = {
  table: 'brands',
  id: 'bbbbbbbb-0000-0000-0000-000000000001',
  name: 'Acme Brand',
  brand_name: null,
  rank: 0.75,
}

function makeResponse(results = [EFFECTS_RESULT, BRANDS_RESULT], total = 2) {
  return { results, total }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SearchPage />
    </QueryClientProvider>
  )
}

describe('SearchPage — empty / short query', () => {
  beforeEach(() => {
    mockGetSearchParam = () => null
  })

  it('shows the empty state prompt when no query', () => {
    renderPage()
    expect(screen.getByText(/enter at least 2 characters/i)).toBeInTheDocument()
  })

  it('shows the empty state prompt when query is 1 character', () => {
    mockGetSearchParam = (k: string) => (k === 'q' ? 'x' : null)
    renderPage()
    expect(screen.getByText(/enter at least 2 characters/i)).toBeInTheDocument()
  })
})

describe('SearchPage — loading and results', () => {
  beforeEach(() => {
    mockGetSearchParam = (k: string) => (k === 'q' ? 'reverb' : null)
  })

  it('shows loading spinner while fetching', () => {
    mockSearchGlobal.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/searching/i)).toBeInTheDocument()
  })

  it('shows results after fetch resolves', async () => {
    mockSearchGlobal.mockResolvedValue(makeResponse())
    renderPage()
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    expect(screen.getByText('Acme Brand')).toBeInTheDocument()
  })

  it('shows the result count', async () => {
    mockSearchGlobal.mockResolvedValue(makeResponse())
    renderPage()
    await waitFor(() => expect(screen.getByText(/2 results/i)).toBeInTheDocument())
  })

  it('shows the search query in the heading', async () => {
    mockSearchGlobal.mockResolvedValue(makeResponse())
    renderPage()
    await waitFor(() => expect(screen.getByText('reverb')).toBeInTheDocument())
  })

  it('renders result items as buttons (not links)', async () => {
    mockSearchGlobal.mockResolvedValue(makeResponse([EFFECTS_RESULT], 1))
    renderPage()
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reverb pro/i })).toBeInTheDocument()
  })

  it('shows brand_name as subtitle when present', async () => {
    mockSearchGlobal.mockResolvedValue(makeResponse([EFFECTS_RESULT], 1))
    renderPage()
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument())
  })

  it('shows table label on the right side', async () => {
    mockSearchGlobal.mockResolvedValue(makeResponse([EFFECTS_RESULT], 1))
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Effects').length).toBeGreaterThan(0))
  })

  it('shows error message when fetch fails', async () => {
    mockSearchGlobal.mockRejectedValue(new Error('Network error'))
    renderPage()
    await waitFor(() => expect(screen.getByText(/network error/i)).toBeInTheDocument())
  })
})

describe('SearchPage — modal open/close', () => {
  beforeEach(() => {
    mockGetSearchParam = (k: string) => (k === 'q' ? 'reverb' : null)
    mockSearchGlobal.mockResolvedValue(makeResponse([EFFECTS_RESULT], 1))
  })

  it('opens SearchRecordModal when a result is clicked', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /reverb pro/i }))
    expect(screen.getByTestId('search-record-modal')).toBeInTheDocument()
    expect(screen.getByTestId('search-record-modal')).toHaveAttribute('data-result-id', EFFECTS_RESULT.id)
  })

  it('closes the modal when onClose is called', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /reverb pro/i }))
    expect(screen.getByTestId('search-record-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close modal/i }))
    expect(screen.queryByTestId('search-record-modal')).not.toBeInTheDocument()
  })

  it('closes the modal when the notes toggle changes', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /reverb pro/i }))
    expect(screen.getByTestId('search-record-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.queryByTestId('search-record-modal')).not.toBeInTheDocument()
  })

  it('closes the modal when the active tab changes', async () => {
    mockSearchGlobal.mockResolvedValue(makeResponse())
    renderPage()
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /reverb pro/i }))
    expect(screen.getByTestId('search-record-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^effects/i }))
    expect(screen.queryByTestId('search-record-modal')).not.toBeInTheDocument()
  })

  it('closes the modal and resets the tab when the search query changes', async () => {
    mockSearchGlobal.mockResolvedValue(makeResponse())
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <SearchPage />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    // Select a tab and open the modal
    fireEvent.click(screen.getByRole('button', { name: /^effects/i }))
    fireEvent.click(screen.getByRole('button', { name: /reverb pro/i }))
    expect(screen.getByTestId('search-record-modal')).toBeInTheDocument()

    // Change the query
    mockGetSearchParam = (k: string) => (k === 'q' ? 'new-query' : null)
    mockSearchGlobal.mockResolvedValue(makeResponse())
    rerender(
      <QueryClientProvider client={client}>
        <SearchPage />
      </QueryClientProvider>
    )

    expect(screen.queryByTestId('search-record-modal')).not.toBeInTheDocument()
    // All tab should be active again (tab-specific buttons are gone until results load)
    expect(screen.queryByRole('button', { name: /^effects/i })).not.toBeInTheDocument()
  })
})

describe('SearchPage — tabs', () => {
  beforeEach(() => {
    mockGetSearchParam = (k: string) => (k === 'q' ? 'reverb' : null)
    mockSearchGlobal.mockResolvedValue(makeResponse())
  })

  it('renders All tab and per-table tabs', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^effects/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^brands/i })).toBeInTheDocument()
  })

  it('filters results when a table tab is selected', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^effects/i }))
    expect(screen.getByText('Reverb Pro')).toBeInTheDocument()
    expect(screen.queryByText('Acme Brand')).not.toBeInTheDocument()
  })

  it('shows all results when All tab is active', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    expect(screen.getByText('Acme Brand')).toBeInTheDocument()
  })
})

describe('SearchPage — notes toggle', () => {
  beforeEach(() => {
    mockGetSearchParam = (k: string) => (k === 'q' ? 'reverb' : null)
    mockSearchGlobal.mockResolvedValue(makeResponse())
  })

  it('renders the notes toggle checkbox', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('re-fetches with notes=true when toggle is checked', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    mockSearchGlobal.mockResolvedValue(makeResponse())
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(mockSearchGlobal).toHaveBeenCalledWith('reverb', true))
  })
})
