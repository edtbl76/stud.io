import * as React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ModelSelectSingle } from '@/components/ui/ModelSelectSingle'
import type { Model } from '@/lib/types'

const mockListPaged = jest.fn()

jest.mock('@/lib/api', () => ({
  api: {
    listPaged: (...args: unknown[]) => mockListPaged(...args),
  },
}))

const mockModel: Model = {
  model_id: 'model-1',
  model_name: 'Stratocaster',
  brand_id: 'brand-1',
  brand_name: 'Fender',
  full_model_name: 'Fender Stratocaster',
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

describe('ModelSelectSingle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('renders input with default placeholder', () => {
    render(<ModelSelectSingle value="" displayName="" onChange={() => {}} />)
    expect(screen.getByPlaceholderText('Search models...')).toBeInTheDocument()
  })

  it('accepts a custom placeholder', () => {
    render(<ModelSelectSingle value="" displayName="" onChange={() => {}} placeholder="Search pickups..." />)
    expect(screen.getByPlaceholderText('Search pickups...')).toBeInTheDocument()
  })

  it('initializes with displayName as the input value', () => {
    render(<ModelSelectSingle value="model-1" displayName="Fender Stratocaster" onChange={() => {}} />)
    expect(screen.getByDisplayValue('Fender Stratocaster')).toBeInTheDocument()
  })

  it('shows results after debounce when query is typed', async () => {
    mockListPaged.mockResolvedValue({ items: [mockModel], total: 1 })
    render(<ModelSelectSingle value="" displayName="" onChange={() => {}} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Strat' } })
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => expect(screen.getByText('Fender Stratocaster')).toBeInTheDocument())
    expect(mockListPaged).toHaveBeenCalledWith('/studio/catalog/models', expect.objectContaining({
      filters: expect.objectContaining({ name: { value: 'Strat', operator: 'contains' } }),
    }))
  })

  it('does not search when query is empty', async () => {
    render(<ModelSelectSingle value="" displayName="" onChange={() => {}} />)

    fireEvent.focus(screen.getByRole('textbox'))
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => expect(mockListPaged).not.toHaveBeenCalled())
  })

  it('includes typeFilter in the listPaged call when provided', async () => {
    mockListPaged.mockResolvedValue({ items: [], total: 0 })
    render(<ModelSelectSingle value="" displayName="" onChange={() => {}} typeFilter="Pickup" />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Strat' } })
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => expect(mockListPaged).toHaveBeenCalled())
    expect(mockListPaged).toHaveBeenCalledWith('/studio/catalog/models', expect.objectContaining({
      filters: expect.objectContaining({
        name: { value: 'Strat', operator: 'contains' },
        model_type: { value: 'Pickup', operator: 'contains' },
      }),
    }))
  })

  it('does not include model_type filter when typeFilter is omitted', async () => {
    mockListPaged.mockResolvedValue({ items: [], total: 0 })
    render(<ModelSelectSingle value="" displayName="" onChange={() => {}} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Strat' } })
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => expect(mockListPaged).toHaveBeenCalled())
    const [, opts] = mockListPaged.mock.calls[0] as [unknown, { filters: Record<string, unknown> }]
    expect(opts.filters).not.toHaveProperty('model_type')
  })

  it('calls onChange with id and full_model_name when a result is selected', async () => {
    mockListPaged.mockResolvedValue({ items: [mockModel], total: 1 })
    const onChange = jest.fn()
    render(<ModelSelectSingle value="" displayName="" onChange={onChange} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Strat' } })
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => screen.getByText('Fender Stratocaster'))
    fireEvent.click(screen.getByText('Fender Stratocaster'))

    expect(onChange).toHaveBeenCalledWith('model-1', 'Fender Stratocaster')
  })

  it('clears selection when X is clicked', () => {
    const onChange = jest.fn()
    render(<ModelSelectSingle value="model-1" displayName="Fender Stratocaster" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledWith('', '')
  })
})
