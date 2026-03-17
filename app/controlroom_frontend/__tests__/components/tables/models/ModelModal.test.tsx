import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModelModal } from '@/components/tables/models/ModelModal'
import type { Model } from '@/lib/types'

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

jest.mock('@/components/ui/BrandSelect', () => ({
  BrandSelect: () => null,
}))

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const mockModel: Model = {
  model_id: 'model-1',
  model_name: 'Neve 1073',
  brand_id: null,
  brand_name: 'Neve',
  full_model_name: 'Neve 1073',
  model_type_ids: null,
  model_types: [],
  creator: 'Rupert Neve',
  years_active: '1970–present',
  links: null,
  description: 'Classic preamp',
  recording_notes: null,
  artist_reference: null,
  attributes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('ModelModal — view mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows create title when record is null', () => {
    renderWithClient(<ModelModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('New Model')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(<ModelModal record={mockModel} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Neve 1073/i)).toBeInTheDocument()
  })

  it('displays record fields in view mode', () => {
    renderWithClient(<ModelModal record={mockModel} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('Classic preamp')).toBeInTheDocument()
    expect(screen.getByText('Rupert Neve')).toBeInTheDocument()
  })
})

describe('ModelModal — create mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders required form field in create mode', () => {
    renderWithClient(<ModelModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByLabelText(/model name/i)).toBeInTheDocument()
  })

  it('calls api.create with form data on save', async () => {
    mockCreate.mockResolvedValue({ ...mockModel, model_id: 'new-id' })
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<ModelModal record={null} onClose={onClose} onMutate={onMutate} />)

    fireEvent.change(screen.getByLabelText(/model name/i), { target: { value: 'API 512c' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('/catalog/models', expect.objectContaining({ model_name: 'API 512c' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows error message when create fails', async () => {
    mockCreate.mockRejectedValue(new Error('Name is required'))
    renderWithClient(<ModelModal record={null} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Name is required')).toBeInTheDocument())
  })
})

describe('ModelModal — edit mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders form fields with existing values', () => {
    renderWithClient(<ModelModal record={mockModel} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByDisplayValue('Neve 1073')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Rupert Neve')).toBeInTheDocument()
  })

  it('calls api.update on save', async () => {
    mockUpdate.mockResolvedValue(mockModel)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<ModelModal record={mockModel} onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Neve 1073'), { target: { value: 'Neve 1084' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('/catalog/models', 'model-1', expect.objectContaining({ model_name: 'Neve 1084' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('calls api.delete and closes after confirming delete', async () => {
    mockDelete.mockResolvedValue(undefined)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<ModelModal record={mockModel} onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/catalog/models', 'model-1'))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('shows error when save fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Conflict'))
    renderWithClient(<ModelModal record={mockModel} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Conflict')).toBeInTheDocument())
  })
})
