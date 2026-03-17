import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EffectModal } from '@/components/tables/effects/EffectModal'
import type { Effect } from '@/lib/types'

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

const mockEffect: Effect = {
  effect_id: 'test-effect-id',
  effect_name: 'Test Effect',
  brand_id: null,
  brand_name: null,
  full_effect_name: 'Test Effect',
  version: null,
  collection: null,
  model_ids: null,
  models: [],
  effect_type_ids: null,
  effect_types: [],
  tool_type_ids: null,
  tool_types: [],
  plugin_format_ids: null,
  plugin_formats: [],
  tag_ids: null,
  tags: [],
  parents: [],
  description: null,
  workflow_notes: null,
  recording_notes: null,
  artist_reference: null,
  attributes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('EffectModal', () => {
  it('shows create title when record is null', () => {
    renderWithClient(
      <EffectModal record={null} onClose={() => {}} onMutate={() => {}} />
    )
    expect(screen.getByText('New Effect')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(
      <EffectModal record={mockEffect} onClose={() => {}} onMutate={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Test Effect/i)).toBeInTheDocument()
  })

  it('displays record name in view mode', () => {
    renderWithClient(
      <EffectModal record={mockEffect} onClose={() => {}} onMutate={() => {}} />
    )
    expect(screen.getAllByText('Test Effect').length).toBeGreaterThan(0)
  })
})
