import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchRecordModal } from '@/components/SearchRecordModal'
import type { SearchResult } from '@/lib/types'

const mockGet = jest.fn()
const mockRouterPush = jest.fn()

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ role: 'admin', token: 'test-token' }),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

jest.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}))

// Mock RecordModal to expose a real context and render the leading action.
// The real RecordModal is deep in each specific modal's render tree; mocking it here
// lets SearchRecordModal's context provider reach the consumer without rendering
// the full modal implementation.
jest.mock('@/components/RecordModal', () => {
  const React = require('react') as typeof import('react')
  const RecordModalLeadingAction = React.createContext<React.ReactNode>(null)
  function RecordModal({ children }: Readonly<{ children?: React.ReactNode }>) {
    const leading = React.useContext(RecordModalLeadingAction)
    return <div data-testid="record-modal">{leading}{children}</div>
  }
  return { RecordModalLeadingAction, RecordModal }
})

jest.mock('@/components/tables/brands/BrandModal', () => {
  const { RecordModal } = require('@/components/RecordModal')
  return {
    BrandModal: () => <RecordModal><div data-testid="brand-modal" /></RecordModal>,
  }
})
jest.mock('@/components/tables/models/ModelModal', () => ({
  ModelModal: () => <div data-testid="model-modal" />,
}))
jest.mock('@/components/tables/effects/EffectModal', () => ({
  EffectModal: () => <div data-testid="effect-modal" />,
}))
jest.mock('@/components/tables/instruments/InstrumentModal', () => ({
  InstrumentModal: () => <div data-testid="instrument-modal" />,
}))
jest.mock('@/components/tables/libraries/LibraryModal', () => ({
  LibraryModal: () => <div data-testid="library-modal" />,
}))
jest.mock('@/components/tables/workstations/WorkstationModal', () => ({
  WorkstationModal: () => <div data-testid="workstation-modal" />,
}))
jest.mock('@/components/tables/tools/ToolModal', () => ({
  ToolModal: ({ category }: { category: string }) => (
    <div data-testid="tool-modal" data-category={category} />
  ),
}))

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    table: 'brands',
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    name: 'Test Record',
    brand_name: null,
    rank: 1,
    ...overrides,
  }
}

function renderModal(result: SearchResult, onClose = jest.fn(), onMutate = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SearchRecordModal result={result} onClose={onClose} onMutate={onMutate} />
    </QueryClientProvider>
  )
}

describe('SearchRecordModal — loading state', () => {
  it('renders skeleton while record is loading', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderModal(makeResult({ table: 'brands' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByTestId('brand-modal')).not.toBeInTheDocument()
  })

  it('calls onClose when the fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('fail'))
    const onClose = jest.fn()
    renderModal(makeResult({ table: 'brands' }), onClose)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})

describe('SearchRecordModal — modal registry', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue({ brand_id: 'id-1', brand_name: 'Test' })
  })

  it('renders BrandModal for brands table', async () => {
    renderModal(makeResult({ table: 'brands' }))
    await waitFor(() => expect(screen.getByTestId('brand-modal')).toBeInTheDocument())
  })

  it('renders ModelModal for models table', async () => {
    mockGet.mockResolvedValue({ model_id: 'id-1', model_name: 'Test' })
    renderModal(makeResult({ table: 'models' }))
    await waitFor(() => expect(screen.getByTestId('model-modal')).toBeInTheDocument())
  })

  it('renders EffectModal for effects table', async () => {
    mockGet.mockResolvedValue({ effect_id: 'id-1' })
    renderModal(makeResult({ table: 'effects' }))
    await waitFor(() => expect(screen.getByTestId('effect-modal')).toBeInTheDocument())
  })

  it('renders ToolModal with correct category for tool tables', async () => {
    mockGet.mockResolvedValue({ tool_id: 'id-1' })
    renderModal(makeResult({ table: 'workflow_tools' }))
    await waitFor(() => {
      const modal = screen.getByTestId('tool-modal')
      expect(modal).toBeInTheDocument()
      expect(modal).toHaveAttribute('data-category', 'workflow')
    })
  })

  it('renders ToolModal with measurement category', async () => {
    mockGet.mockResolvedValue({ tool_id: 'id-1' })
    renderModal(makeResult({ table: 'measurement_tools' }))
    await waitFor(() =>
      expect(screen.getByTestId('tool-modal')).toHaveAttribute('data-category', 'measurement')
    )
  })

  it('returns null for an unknown table', () => {
    mockGet.mockResolvedValue({})
    const { container } = renderModal(makeResult({ table: 'unknown_table' }))
    expect(container).toBeEmptyDOMElement()
  })
})

describe('SearchRecordModal — Go to button', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue({ brand_id: 'id-1', brand_name: 'Test' })
  })

  it('renders "Go to Brands" button after loading', async () => {
    renderModal(makeResult({ table: 'brands' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /go to brands/i })).toBeInTheDocument())
  })

  it('navigates to the table with ?open= param when clicked', async () => {
    const result = makeResult({ table: 'brands', id: 'test-uuid' })
    renderModal(result)
    await waitFor(() => expect(screen.getByRole('button', { name: /go to brands/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /go to brands/i }))
    expect(mockRouterPush).toHaveBeenCalledWith('/catalog/brands?open=test-uuid')
  })

  it('calls onClose when "Go to" button is clicked', async () => {
    const onClose = jest.fn()
    const result = makeResult({ table: 'brands', id: 'test-uuid' })
    renderModal(result, onClose)
    await waitFor(() => expect(screen.getByRole('button', { name: /go to brands/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /go to brands/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
