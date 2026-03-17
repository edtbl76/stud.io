import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrandModal } from '@/components/tables/brands/BrandModal'
import type { Brand } from '@/lib/types'

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

const mockBrand: Brand = {
  brand_id: 'test-id',
  brand_name: 'Test Brand',
  legal_name: 'Test Legal Name',
  entity_type_id: null,
  entity_type_name: null,
  website: null,
  description: null,
  founder: null,
  years: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('BrandModal', () => {
  it('shows create title when record is null', () => {
    renderWithClient(
      <BrandModal record={null} onClose={() => {}} onMutate={() => {}} />
    )
    expect(screen.getByText('New Brand')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(
      <BrandModal record={mockBrand} onClose={() => {}} onMutate={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Test Brand/i)).toBeInTheDocument()
  })

  it('displays record name in view mode', () => {
    renderWithClient(
      <BrandModal record={mockBrand} onClose={() => {}} onMutate={() => {}} />
    )
    expect(screen.getAllByText('Test Brand').length).toBeGreaterThan(0)
  })
})
