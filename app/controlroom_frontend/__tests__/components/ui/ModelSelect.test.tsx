import * as React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModelSelect } from '@/components/ui/ModelSelect'
import type { Model } from '@/lib/types'

const mockListPaged = jest.fn()

jest.mock('@/lib/api', () => ({
  api: {
    listPaged: (...args: unknown[]) => mockListPaged(...args),
  },
}))

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const mockModel: Model = {
  model_id: 'model-1',
  model_name: '1176',
  brand_id: 'brand-1',
  brand_name: 'Universal Audio',
  full_model_name: 'Universal Audio 1176',
  model_type_ids: null,
  model_types: [],
  creator: null,
  years_active: null,
  links: null,
  description: null,
  recording_notes: null,
  artist_reference: null,
  attributes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('ModelSelect', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('renders input with placeholder', () => {
    renderWithClient(<ModelSelect value={[]} selectedModels={[]} onChange={() => {}} />)
    expect(screen.getByPlaceholderText('Search models...')).toBeInTheDocument()
  })

  it('accepts custom placeholder', () => {
    renderWithClient(<ModelSelect value={[]} selectedModels={[]} onChange={() => {}} placeholder="Pick a model" />)
    expect(screen.getByPlaceholderText('Pick a model')).toBeInTheDocument()
  })

  it('shows results after debounce when query is typed', async () => {
    mockListPaged.mockResolvedValue({ items: [mockModel], total: 1 })
    renderWithClient(<ModelSelect value={[]} selectedModels={[]} onChange={() => {}} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '1176' } })
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => expect(screen.getByText('Universal Audio 1176')).toBeInTheDocument())
    expect(mockListPaged).toHaveBeenCalledWith('/models', expect.objectContaining({ filters: { name: '1176' } }))
  })

  it('does not search when query is empty', async () => {
    renderWithClient(<ModelSelect value={[]} selectedModels={[]} onChange={() => {}} />)

    fireEvent.focus(screen.getByRole('textbox'))
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => expect(mockListPaged).not.toHaveBeenCalled())
  })

  it('calls onChange with added model when result is clicked', async () => {
    mockListPaged.mockResolvedValue({ items: [mockModel], total: 1 })
    const onChange = jest.fn()
    renderWithClient(<ModelSelect value={[]} selectedModels={[]} onChange={onChange} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '1176' } })
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => screen.getByText('Universal Audio 1176'))
    fireEvent.click(screen.getByText('Universal Audio 1176'))

    expect(onChange).toHaveBeenCalledWith(
      ['model-1'],
      [{ id: 'model-1', name: 'Universal Audio 1176' }],
    )
  })

  it('calls onChange with model removed when already-selected result is clicked', async () => {
    mockListPaged.mockResolvedValue({ items: [mockModel], total: 1 })
    const onChange = jest.fn()
    const selectedModels = [{ id: 'model-1', name: 'Universal Audio 1176' }]
    renderWithClient(
      <ModelSelect value={['model-1']} selectedModels={selectedModels} onChange={onChange} />
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '1176' } })
    act(() => { jest.advanceTimersByTime(300) })

    // Wait until both the dropdown result AND the badge are present (2 elements with that text)
    await waitFor(() => expect(screen.getAllByText('Universal Audio 1176')).toHaveLength(2))
    // Dropdown result comes before badge in DOM order (inside the relative div above badges)
    fireEvent.click(screen.getAllByText('Universal Audio 1176')[0])

    expect(onChange).toHaveBeenCalledWith([], [])
  })

  it('renders selected models as badges', () => {
    const selectedModels = [{ id: 'model-1', name: 'Universal Audio 1176' }]
    renderWithClient(
      <ModelSelect value={['model-1']} selectedModels={selectedModels} onChange={() => {}} />
    )
    expect(screen.getByText('Universal Audio 1176')).toBeInTheDocument()
  })

  it('calls onChange with model removed when badge X is clicked', () => {
    const onChange = jest.fn()
    const selectedModels = [{ id: 'model-1', name: 'Universal Audio 1176' }]
    renderWithClient(
      <ModelSelect value={['model-1']} selectedModels={selectedModels} onChange={onChange} />
    )

    fireEvent.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledWith([], [])
  })
})
