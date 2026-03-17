import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModelModal } from '@/components/tables/models/ModelModal'
import type { Model } from '@/lib/types'

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ role: 'admin', token: 'test-token' }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue(undefined),
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

const mockModel: Model = {
  model_id: 'test-model-id',
  model_name: 'Test Model',
  brand_id: null,
  brand_name: null,
  full_model_name: 'Test Model',
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

describe('ModelModal', () => {
  it('shows create title when record is null', () => {
    renderWithClient(
      <ModelModal record={null} onClose={() => {}} onMutate={() => {}} />
    )
    expect(screen.getByText('New Model')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(
      <ModelModal record={mockModel} onClose={() => {}} onMutate={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Test Model/i)).toBeInTheDocument()
  })

  it('displays record name in view mode', () => {
    renderWithClient(
      <ModelModal record={mockModel} onClose={() => {}} onMutate={() => {}} />
    )
    expect(screen.getAllByText('Test Model').length).toBeGreaterThan(0)
  })
})
