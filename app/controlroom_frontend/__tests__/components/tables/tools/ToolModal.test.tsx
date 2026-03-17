import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToolModal } from '@/components/tables/tools/ToolModal'
import type { Tool } from '@/lib/types'

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

const mockTool: Tool = {
  tool_id: 'test-tool-id',
  tool_name: 'Test Tool',
  brand_id: null,
  brand_name: null,
  full_tool_name: 'Test Tool',
  version: null,
  model_ids: null,
  models: [],
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

describe('ToolModal', () => {
  it('shows create title when record is null', () => {
    renderWithClient(
      <ToolModal
        record={null}
        category="mixing"
        onClose={() => {}}
        onMutate={() => {}}
      />
    )
    expect(screen.getByText('New Mixing Tool')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(
      <ToolModal
        record={mockTool}
        category="mixing"
        onClose={() => {}}
        onMutate={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Test Tool/i)).toBeInTheDocument()
  })

  it('displays record name in view mode', () => {
    renderWithClient(
      <ToolModal
        record={mockTool}
        category="mixing"
        onClose={() => {}}
        onMutate={() => {}}
      />
    )
    expect(screen.getAllByText('Test Tool').length).toBeGreaterThan(0)
  })
})
