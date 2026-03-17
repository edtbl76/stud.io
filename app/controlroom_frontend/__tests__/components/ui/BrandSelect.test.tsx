import * as React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrandSelect } from '@/components/ui/BrandSelect'
import type { Brand } from '@/lib/types'

const mockList = jest.fn()
const mockCreate = jest.fn()

jest.mock('@/lib/api', () => ({
  api: {
    list: (...args: unknown[]) => mockList(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}))

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const mockBrand: Brand = {
  brand_id: 'brand-1',
  brand_name: 'Steinway',
  legal_name: null,
  entity_type_id: null,
  entity_type_name: null,
  website: null,
  description: null,
  founder: null,
  years: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('BrandSelect', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('renders input with placeholder', () => {
    renderWithClient(<BrandSelect value="" displayName="" onChange={() => {}} />)
    expect(screen.getByPlaceholderText('Search brands...')).toBeInTheDocument()
  })

  it('accepts custom placeholder', () => {
    renderWithClient(<BrandSelect value="" displayName="" onChange={() => {}} placeholder="Pick a brand" />)
    expect(screen.getByPlaceholderText('Pick a brand')).toBeInTheDocument()
  })

  it('initializes with displayName as input value', () => {
    renderWithClient(<BrandSelect value="brand-1" displayName="Steinway" onChange={() => {}} />)
    expect(screen.getByDisplayValue('Steinway')).toBeInTheDocument()
  })

  it('shows results after debounce when query is typed', async () => {
    mockList.mockResolvedValue([mockBrand])
    renderWithClient(<BrandSelect value="" displayName="" onChange={() => {}} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Stein' } })
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => expect(screen.getByText('Steinway')).toBeInTheDocument())
    expect(mockList).toHaveBeenCalledWith('/brands', 'Stein')
  })

  it('does not search when query is empty', async () => {
    renderWithClient(<BrandSelect value="" displayName="" onChange={() => {}} />)

    fireEvent.focus(screen.getByRole('textbox'))
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => expect(mockList).not.toHaveBeenCalled())
  })

  it('calls onChange when a result is selected', async () => {
    mockList.mockResolvedValue([mockBrand])
    const onChange = jest.fn()
    renderWithClient(<BrandSelect value="" displayName="" onChange={onChange} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Stein' } })
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => screen.getByText('Steinway'))
    fireEvent.click(screen.getByText('Steinway'))

    expect(onChange).toHaveBeenCalledWith('brand-1', 'Steinway')
  })

  it('shows Create option when no exact match', async () => {
    mockList.mockResolvedValue([])
    renderWithClient(<BrandSelect value="" displayName="" onChange={() => {}} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'NewBrand' } })
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => expect(screen.getByText(/Create "NewBrand"/)).toBeInTheDocument())
  })

  it('does not show Create option when exact match exists', async () => {
    mockList.mockResolvedValue([mockBrand])
    renderWithClient(<BrandSelect value="" displayName="" onChange={() => {}} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Steinway' } })
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => screen.getByText('Steinway'))
    expect(screen.queryByText(/Create "Steinway"/)).not.toBeInTheDocument()
  })

  it('calls api.create and onChange when create is submitted', async () => {
    mockList.mockResolvedValue([])
    mockCreate.mockResolvedValue({ ...mockBrand, brand_id: 'new-brand', brand_name: 'NewBrand' })
    const onChange = jest.fn()
    renderWithClient(<BrandSelect value="" displayName="" onChange={onChange} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'NewBrand' } })
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => screen.getByText(/Create "NewBrand"/))
    fireEvent.click(screen.getByText(/Create "NewBrand"/))

    fireEvent.click(screen.getByRole('button', { name: /^Create$/ }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('/brands', { brand_name: 'NewBrand' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('new-brand', 'NewBrand'))
  })

  it('shows error message when create fails', async () => {
    mockList.mockResolvedValue([])
    mockCreate.mockRejectedValue(new Error('Brand already exists'))
    renderWithClient(<BrandSelect value="" displayName="" onChange={() => {}} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Dupe' } })
    act(() => { jest.advanceTimersByTime(300) })

    await waitFor(() => screen.getByText(/Create "Dupe"/))
    fireEvent.click(screen.getByText(/Create "Dupe"/))
    fireEvent.click(screen.getByRole('button', { name: /^Create$/ }))

    await waitFor(() => expect(screen.getByText('Brand already exists')).toBeInTheDocument())
  })

  it('clears selection when X is clicked', () => {
    const onChange = jest.fn()
    renderWithClient(<BrandSelect value="brand-1" displayName="Steinway" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledWith('', '')
  })
})
