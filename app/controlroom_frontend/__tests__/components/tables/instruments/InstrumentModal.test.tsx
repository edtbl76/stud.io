import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InstrumentModal } from '@/components/tables/instruments/InstrumentModal'
import type { Instrument } from '@/lib/types'

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

jest.mock('@/components/ui/ModelSelect', () => ({
  ModelSelect: () => null,
}))

jest.mock('@/components/ModelLinks', () => ({
  ModelLinks: () => null,
}))

jest.mock('@/components/ui/ParentSelect', () => ({
  ParentSelect: () => null,
}))

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const mockInstrument: Instrument = {
  instrument_id: 'inst-1',
  instrument_name: 'Grand Piano',
  brand_id: null,
  brand_name: 'Steinway',
  full_instrument_name: 'Steinway Grand Piano',
  version: '1.0',
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
  description: 'A beautiful piano',
  instrument_notes: '88 keys sampled',
  recording_notes: null,
  artist_reference: null,
  attributes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('InstrumentModal — view mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows create title when record is null', () => {
    renderWithClient(<InstrumentModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('New Instrument')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(<InstrumentModal record={mockInstrument} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Steinway Grand Piano/i)).toBeInTheDocument()
  })

  it('displays record fields in view mode', () => {
    renderWithClient(<InstrumentModal record={mockInstrument} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('A beautiful piano')).toBeInTheDocument()
    expect(screen.getByText('88 keys sampled')).toBeInTheDocument()
  })

  it('shows artist_reference when present', () => {
    const record = { ...mockInstrument, artist_reference: 'Elton John' }
    renderWithClient(<InstrumentModal record={record} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('Elton John')).toBeInTheDocument()
  })
})

describe('InstrumentModal — create mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders required form field in create mode', () => {
    renderWithClient(<InstrumentModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByLabelText(/instrument name/i)).toBeInTheDocument()
  })

  it('calls api.create with form data on save', async () => {
    mockCreate.mockResolvedValue({ ...mockInstrument, instrument_id: 'new-id' })
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<InstrumentModal record={null} onClose={onClose} onMutate={onMutate} />)

    fireEvent.change(screen.getByLabelText(/instrument name/i), { target: { value: 'Upright Bass' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('/instruments', expect.objectContaining({ instrument_name: 'Upright Bass' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('shows error message when create fails', async () => {
    mockCreate.mockRejectedValue(new Error('Name is required'))
    renderWithClient(<InstrumentModal record={null} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Name is required')).toBeInTheDocument())
  })
})

describe('InstrumentModal — edit mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders form fields with existing values', () => {
    renderWithClient(<InstrumentModal record={mockInstrument} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByDisplayValue('Grand Piano')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1.0')).toBeInTheDocument()
  })

  it('calls api.update on save', async () => {
    mockUpdate.mockResolvedValue(mockInstrument)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<InstrumentModal record={mockInstrument} onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Grand Piano'), { target: { value: 'Baby Grand' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('/instruments', 'inst-1', expect.objectContaining({ instrument_name: 'Baby Grand' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('calls api.delete and closes after confirming delete', async () => {
    mockDelete.mockResolvedValue(undefined)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<InstrumentModal record={mockInstrument} onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/instruments', 'inst-1'))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('includes model_ids in update payload even when empty', async () => {
    mockUpdate.mockResolvedValue(mockInstrument)
    renderWithClient(<InstrumentModal record={mockInstrument} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Grand Piano'), { target: { value: 'Grand Piano 2' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
      '/instruments', 'inst-1',
      expect.objectContaining({ model_ids: [] }),
    ))
  })

  it('includes parent_ids in update payload even when empty', async () => {
    mockUpdate.mockResolvedValue(mockInstrument)
    renderWithClient(<InstrumentModal record={mockInstrument} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Grand Piano'), { target: { value: 'Grand Piano 2' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
      '/instruments', 'inst-1',
      expect.objectContaining({ parent_ids: [] }),
    ))
  })

  it('shows error when save fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Update failed'))
    renderWithClient(<InstrumentModal record={mockInstrument} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Update failed')).toBeInTheDocument())
  })

  it('pre-fills artist_reference input in edit mode', () => {
    const record = { ...mockInstrument, artist_reference: 'Elton John' }
    renderWithClient(<InstrumentModal record={record} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByLabelText(/artist reference/i)).toHaveValue('Elton John')
  })

  it('includes artist_reference in update payload', async () => {
    mockUpdate.mockResolvedValue(mockInstrument)
    const record = { ...mockInstrument, artist_reference: 'Elton John' }
    renderWithClient(<InstrumentModal record={record} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByLabelText(/artist reference/i), { target: { value: 'Miles Davis' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
      '/instruments', 'inst-1',
      expect.objectContaining({ artist_reference: 'Miles Davis' }),
    ))
  })

  it('sends null when artist_reference is cleared', async () => {
    mockUpdate.mockResolvedValue(mockInstrument)
    const record = { ...mockInstrument, artist_reference: 'Elton John' }
    renderWithClient(<InstrumentModal record={record} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByLabelText(/artist reference/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
      '/instruments', 'inst-1',
      expect.objectContaining({ artist_reference: null }),
    ))
  })
})
