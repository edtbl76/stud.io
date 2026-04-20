import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModelLinks } from '@/components/ModelLinks'
import type { Model } from '@/lib/types'

const mockGet = jest.fn()

jest.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ role: 'user', token: null }),
}))

jest.mock('@/components/tables/models/ModelModal', () => ({
  ModelModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      <span>Model Modal</span>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}))

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

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ModelLinks', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders a dash when models is null', () => {
    renderWithClient(<ModelLinks models={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a dash when models is empty', () => {
    renderWithClient(<ModelLinks models={[]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders model names as chips', () => {
    const models = [
      { id: 'model-1', name: 'Universal Audio 1176' },
      { id: 'model-2', name: 'Teletronix LA-2A' },
    ]
    renderWithClient(<ModelLinks models={models} />)
    expect(screen.getByText('Universal Audio 1176')).toBeInTheDocument()
    expect(screen.getByText('Teletronix LA-2A')).toBeInTheDocument()
  })

  it('fetches the model and opens modal when chip is clicked', async () => {
    mockGet.mockResolvedValue(mockModel)
    const models = [{ id: 'model-1', name: 'Universal Audio 1176' }]
    renderWithClient(<ModelLinks models={models} />)

    fireEvent.click(screen.getByText('Universal Audio 1176'))

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/models', 'model-1'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('closes the modal when onClose is called', async () => {
    mockGet.mockResolvedValue(mockModel)
    const models = [{ id: 'model-1', name: 'Universal Audio 1176' }]
    renderWithClient(<ModelLinks models={models} />)

    fireEvent.click(screen.getByText('Universal Audio 1176'))
    await waitFor(() => screen.getByRole('dialog'))

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not open modal when fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('Not found'))
    const models = [{ id: 'model-1', name: 'Universal Audio 1176' }]
    renderWithClient(<ModelLinks models={models} />)

    fireEvent.click(screen.getByText('Universal Audio 1176'))

    await waitFor(() => expect(mockGet).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
