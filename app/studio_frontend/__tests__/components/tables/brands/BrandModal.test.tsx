import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrandModal } from '@/components/tables/brands/BrandModal'
import type { Brand } from '@/lib/types'

const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ role: 'admin', token: 'test-token' }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

jest.mock('@/components/ui/MultiSelect', () => ({
  MultiSelect: () => null,
}))

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const mockBrand: Brand = {
  brand_id: 'test-id',
  brand_name: 'Arturia',
  legal_name: 'Arturia SA',
  entity_type_id: null,
  entity_type_name: null,
  website: 'https://arturia.com',
  description: 'French music tech company',
  founder: 'Frédéric Brun',
  years: '1999–present',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('BrandModal — view mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows create title when record is null', () => {
    renderWithClient(<BrandModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('New Brand')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(<BrandModal record={mockBrand} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Arturia/i)).toBeInTheDocument()
  })

  it('displays record fields in view mode', () => {
    renderWithClient(<BrandModal record={mockBrand} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('Arturia SA')).toBeInTheDocument()
    expect(screen.getByText('French music tech company')).toBeInTheDocument()
    expect(screen.getByText('Frédéric Brun')).toBeInTheDocument()
  })

  it('displays website link in view mode', () => {
    renderWithClient(<BrandModal record={mockBrand} onClose={() => {}} onMutate={() => {}} />)
    const link = screen.getByRole('link', { name: /arturia.com/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://arturia.com')
  })
})

describe('BrandModal — create mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders form fields in create mode', () => {
    renderWithClient(<BrandModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByLabelText(/legal name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/brand name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/website/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/founder/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/years/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
  })

  it('calls api.create with form data on save', async () => {
    mockCreate.mockResolvedValue({ brand_id: 'new-id', brand_name: 'Test', legal_name: 'Test Corp' })
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<BrandModal record={null} onClose={onClose} onMutate={onMutate} />)

    fireEvent.change(screen.getByLabelText(/legal name/i), { target: { value: 'Test Corp' } })
    fireEvent.change(screen.getByLabelText(/brand name/i), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('/studio/catalog/brands', {
      legal_name: 'Test Corp',
      brand_name: 'Test',
    }))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows error message when create fails', async () => {
    mockCreate.mockRejectedValue(new Error('Legal name is required'))
    renderWithClient(<BrandModal record={null} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(screen.getByText('Legal name is required')).toBeInTheDocument()
    )
  })
})

describe('BrandModal — edit mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders form fields with existing values in edit mode', () => {
    renderWithClient(<BrandModal record={mockBrand} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByDisplayValue('Arturia SA')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Arturia')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://arturia.com')).toBeInTheDocument()
  })

  it('calls api.update with form data on save', async () => {
    mockUpdate.mockResolvedValue({ ...mockBrand, brand_name: 'Arturia Updated' })
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<BrandModal record={mockBrand} onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Arturia'), { target: { value: 'Arturia Updated' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
      '/studio/catalog/brands',
      'test-id',
      expect.objectContaining({ brand_name: 'Arturia Updated' })
    ))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows error message when update fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Conflict'))
    renderWithClient(<BrandModal record={mockBrand} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Conflict')).toBeInTheDocument())
  })

  it('calls api.delete and closes after confirming delete', async () => {
    mockDelete.mockResolvedValue(undefined)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<BrandModal record={mockBrand} onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/studio/catalog/brands', 'test-id'))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows error message when delete fails', async () => {
    mockDelete.mockRejectedValue(new Error('Cannot delete: referenced by other records'))
    renderWithClient(<BrandModal record={mockBrand} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() =>
      expect(screen.getByText('Cannot delete: referenced by other records')).toBeInTheDocument()
    )
  })
})
