import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SearchPage from '@/app/search/page'

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ username: 'admin', role: 'admin' }),
}))

const mockSearchGlobal = jest.fn()
let mockGetSearchParam = (_key: string): string | null => null
const mockRouterReplace = jest.fn()

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => mockGetSearchParam(key) }),
  usePathname: () => '/search',
  useRouter: () => ({ replace: mockRouterReplace }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    searchGlobal: (...args: unknown[]) => mockSearchGlobal(...args),
  },
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
    mockGetSearchParam = (k) => (k === 'q' ? 'x' : null)
    renderPage()
    expect(screen.getByText(/enter at least 2 characters/i)).toBeInTheDocument()
  })
})

describe('SearchPage — loading and results', () => {
  beforeEach(() => {
    mockGetSearchParam = (k) => (k === 'q' ? 'reverb' : null)
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

  it('renders result items as links with ?open= deep-link href', async () => {
    mockSearchGlobal.mockResolvedValue(makeResponse([EFFECTS_RESULT], 1))
    renderPage()
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    const link = screen.getByRole('link', { name: /reverb pro/i })
    expect(link).toHaveAttribute('href', `/session/effects?open=${EFFECTS_RESULT.id}`)
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

describe('SearchPage — tabs', () => {
  beforeEach(() => {
    mockGetSearchParam = (k) => (k === 'q' ? 'reverb' : null)
    mockSearchGlobal.mockResolvedValue(makeResponse())
  })

  it('renders All tab and per-table tabs', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Reverb Pro')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /effects/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /brands/i })).toBeInTheDocument()
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
    mockGetSearchParam = (k) => (k === 'q' ? 'reverb' : null)
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
