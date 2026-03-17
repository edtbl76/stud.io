import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigModal } from '@/components/tables/config/ConfigModal'
import type { LookupOut } from '@/lib/types'

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

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const mockConfig: LookupOut = {
  type_id: 'test-type-id',
  type_name: 'Test Type',
  type_description: 'A test type description',
}

describe('ConfigModal', () => {
  it('shows create title when record is null', () => {
    renderWithClient(
      <ConfigModal
        record={null}
        slug="entity-types"
        onClose={() => {}}
        onMutate={() => {}}
      />
    )
    expect(screen.getByText('New Entry')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(
      <ConfigModal
        record={mockConfig}
        slug="entity-types"
        onClose={() => {}}
        onMutate={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Test Type/i)).toBeInTheDocument()
  })

  it('displays record name in view mode', () => {
    renderWithClient(
      <ConfigModal
        record={mockConfig}
        slug="entity-types"
        onClose={() => {}}
        onMutate={() => {}}
      />
    )
    expect(screen.getAllByText('Test Type').length).toBeGreaterThan(0)
  })
})
