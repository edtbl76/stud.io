import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkstationModal } from '@/components/tables/workstations/WorkstationModal'
import type { Workstation } from '@/lib/types'

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

const mockWorkstation: Workstation = {
  workstation_id: 'test-workstation-id',
  tool_name: 'Test Workstation',
  brand_id: null,
  brand_name: null,
  full_tool_name: 'Test Workstation',
  version: null,
  tool_type_ids: null,
  tool_types: [],
  plugin_format_ids: null,
  plugin_formats: [],
  tag_ids: null,
  tags: [],
  description: null,
  workflow_notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('WorkstationModal', () => {
  it('shows create title when record is null', () => {
    renderWithClient(
      <WorkstationModal record={null} onClose={() => {}} onMutate={() => {}} />
    )
    expect(screen.getByText('New Workstation')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(
      <WorkstationModal
        record={mockWorkstation}
        onClose={() => {}}
        onMutate={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Test Workstation/i)).toBeInTheDocument()
  })

  it('displays record name in view mode', () => {
    renderWithClient(
      <WorkstationModal
        record={mockWorkstation}
        onClose={() => {}}
        onMutate={() => {}}
      />
    )
    expect(screen.getAllByText('Test Workstation').length).toBeGreaterThan(0)
  })
})
