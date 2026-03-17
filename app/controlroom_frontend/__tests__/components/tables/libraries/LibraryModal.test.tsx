import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LibraryModal } from '@/components/tables/libraries/LibraryModal'
import type { Library } from '@/lib/types'

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

const mockLibrary: Library = {
  library_id: 'test-library-id',
  library_name: 'Test Library',
  brand_id: null,
  brand_name: null,
  full_library_name: 'Test Library',
  model_ids: null,
  models: [],
  tag_ids: null,
  tags: [],
  parents: [],
  description: null,
  instrument_notes: null,
  recording_notes: null,
  attributes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('LibraryModal', () => {
  it('shows create title when record is null', () => {
    renderWithClient(
      <LibraryModal record={null} onClose={() => {}} onMutate={() => {}} />
    )
    expect(screen.getByText('New Library')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(
      <LibraryModal record={mockLibrary} onClose={() => {}} onMutate={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Test Library/i)).toBeInTheDocument()
  })

  it('displays record name in view mode', () => {
    renderWithClient(
      <LibraryModal record={mockLibrary} onClose={() => {}} onMutate={() => {}} />
    )
    expect(screen.getAllByText('Test Library').length).toBeGreaterThan(0)
  })
})
