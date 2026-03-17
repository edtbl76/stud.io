import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InstrumentModal } from '@/components/tables/instruments/InstrumentModal'
import type { Instrument } from '@/lib/types'

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

const mockInstrument: Instrument = {
  instrument_id: 'test-instrument-id',
  instrument_name: 'Test Instrument',
  brand_id: null,
  brand_name: null,
  full_instrument_name: 'Test Instrument',
  version: null,
  model_ids: null,
  models: [],
  instrument_type_ids: null,
  instrument_types: [],
  tool_type_ids: null,
  tool_types: [],
  plugin_format_ids: null,
  plugin_formats: [],
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

describe('InstrumentModal', () => {
  it('shows create title when record is null', () => {
    renderWithClient(
      <InstrumentModal record={null} onClose={() => {}} onMutate={() => {}} />
    )
    expect(screen.getByText('New Instrument')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(
      <InstrumentModal
        record={mockInstrument}
        onClose={() => {}}
        onMutate={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Test Instrument/i)).toBeInTheDocument()
  })

  it('displays record name in view mode', () => {
    renderWithClient(
      <InstrumentModal
        record={mockInstrument}
        onClose={() => {}}
        onMutate={() => {}}
      />
    )
    expect(screen.getAllByText('Test Instrument').length).toBeGreaterThan(0)
  })
})
