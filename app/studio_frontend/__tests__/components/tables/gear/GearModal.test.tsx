import * as React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GearModal } from '@/components/tables/gear/GearModal'
import type { Gear } from '@/lib/types'
import { GUITAR_TYPE_ID } from '@/lib/gearlist'

const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()
const mockList   = jest.fn()
const mockListPaged = jest.fn()
const mockUploadPhoto = jest.fn()

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ role: 'admin', username: 'testuser' }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    create:      (...args: unknown[]) => mockCreate(...args),
    update:      (...args: unknown[]) => mockUpdate(...args),
    delete:      (...args: unknown[]) => mockDelete(...args),
    list:        (...args: unknown[]) => mockList(...args),
    listPaged:   (...args: unknown[]) => mockListPaged(...args),
    uploadPhoto: (...args: unknown[]) => mockUploadPhoto(...args),
  },
}))

const mockGear: Gear = {
  gear_id: 'gear-1',
  gear_name: 'Fender Strat',
  gear_type_id: GUITAR_TYPE_ID,
  gear_type_name: 'Guitar',
  brand_id: null, brand_name: null,
  model_id: null, model_name: null,
  serial_number: 'S123', year: 2020,
  owner_id: null, photo_key: null, notes: 'Nice guitar', num_strings: 6,
  tuning: 'Standard', pickup_config: 'SSS',
  pickup_neck_model_id: null, pickup_neck_model_name: null,
  pickup_middle_model_id: null, pickup_middle_model_name: null,
  pickup_bridge_model_id: null, pickup_bridge_model_name: null,
  strings_model_id: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
}

const mockBrand = { brand_id: 'brand-uuid-1', brand_name: 'Fender', legal_name: null, entity_type_id: null, entity_type_name: null, website: null, description: null, founder: null, years: null, created_at: '', updated_at: '' }
const mockModel = { model_id: 'model-uuid-1', model_name: 'Stratocaster', brand_id: 'brand-1', brand_name: 'Fender', full_model_name: 'Fender Stratocaster', model_type_ids: null, model_types: [], creator: null, years_active: null, links: null, description: null, recording_notes: null, artist_reference: null, attributes: null, created_at: '', updated_at: '' }

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

async function selectFromSearch(placeholder: string, query: string, resultText: string) {
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: query } })
  act(() => { jest.advanceTimersByTime(300) })
  await waitFor(() => screen.getByText(resultText))
  fireEvent.click(screen.getByText(resultText))
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockList.mockResolvedValue([])
  mockListPaged.mockResolvedValue({ items: [], total: 0 })
})

describe('GearModal — create mode', () => {
  it('shows "New Gear" title', () => {
    renderWithClient(<GearModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('New Gear')).toBeInTheDocument()
  })

  it('renders gear name input', () => {
    renderWithClient(<GearModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument()
  })

  it('calls api.create with gear_name on save', async () => {
    mockCreate.mockResolvedValue({ ...mockGear, gear_id: 'new-id' })
    const onMutate = jest.fn()
    renderWithClient(<GearModal record={null} onClose={() => {}} onMutate={onMutate} />)

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'My Guitar' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('/gearlist/gear', expect.objectContaining({ gear_name: 'My Guitar' })))
  })
})

describe('GearModal — initialTypeId (Guitars page)', () => {
  it('pre-fills type and shows guitar fields when initialTypeId is GUITAR_TYPE_ID', async () => {
    mockList.mockResolvedValue([{ type_id: GUITAR_TYPE_ID, type_name: 'Guitar' }])
    renderWithClient(<GearModal record={null} onClose={() => {}} onMutate={() => {}} initialTypeId={GUITAR_TYPE_ID} />)
    await waitFor(() => expect(screen.getByLabelText(/strings/i)).toBeInTheDocument())
    expect(screen.getByLabelText(/tuning/i)).toBeInTheDocument()
  })

  it('does not show guitar fields when no initialTypeId is provided', async () => {
    renderWithClient(<GearModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.queryByLabelText(/tuning/i)).not.toBeInTheDocument()
  })
})

describe('GearModal — view mode', () => {
  it('shows gear name as title', () => {
    renderWithClient(<GearModal record={mockGear} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getAllByText('Fender Strat').length).toBeGreaterThan(0)
  })

  it('displays pickup config in view mode', () => {
    renderWithClient(<GearModal record={mockGear} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('SSS')).toBeInTheDocument()
  })

  it('shows edit title on clicking edit', () => {
    renderWithClient(<GearModal record={mockGear} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(screen.getByText(/Edit: Fender Strat/i)).toBeInTheDocument()
  })
})

describe('GearModal — edit mode (guitar)', () => {
  it('shows pickup config select for guitar type', () => {
    renderWithClient(<GearModal record={mockGear} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(screen.getByLabelText(/pickup config/i)).toBeInTheDocument()
  })

  it('shows neck/middle/bridge slot inputs for SSS', () => {
    renderWithClient(<GearModal record={mockGear} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(screen.getByLabelText(/neck \(single\)/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/middle \(single\)/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/bridge \(single\)/i)).toBeInTheDocument()
  })

  it('shows only neck/bridge slots for HH', () => {
    const hhGear = { ...mockGear, pickup_config: 'HH' }
    renderWithClient(<GearModal record={hhGear} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(screen.getByLabelText(/neck \(humbucker\)/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/middle/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/bridge \(humbucker\)/i)).toBeInTheDocument()
  })

  it('calls api.update on save', async () => {
    mockUpdate.mockResolvedValue(mockGear)
    const onMutate = jest.fn()
    renderWithClient(<GearModal record={mockGear} onClose={() => {}} onMutate={onMutate} />)
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('/gearlist/gear', 'gear-1', expect.any(Object)))
  })

  it('shows error when save fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Save failed'))
    renderWithClient(<GearModal record={mockGear} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText('Save failed')).toBeInTheDocument())
  })

  it('shows photo upload input only for existing records', () => {
    renderWithClient(<GearModal record={mockGear} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(screen.getByLabelText(/photo/i)).toBeInTheDocument()
  })

  it('does not show photo upload for new records', () => {
    renderWithClient(<GearModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.queryByLabelText(/photo/i)).not.toBeInTheDocument()
  })
})

describe('GearModal — brand/model search', () => {
  it('renders brand and model search inputs', () => {
    renderWithClient(<GearModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByPlaceholderText('Search brands...')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search models...')).toBeInTheDocument()
  })

  it('sends brand_id as null when no brand is selected', async () => {
    mockCreate.mockResolvedValue({ ...mockGear, gear_id: 'new-id' })
    renderWithClient(<GearModal record={null} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'My Guitar' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
      '/gearlist/gear',
      expect.objectContaining({ brand_id: null })
    ))
  })

  it('includes brand_id in create payload when a brand is searched and selected', async () => {
    jest.useFakeTimers()
    mockCreate.mockResolvedValue({ ...mockGear, gear_id: 'new-id' })
    mockListPaged.mockResolvedValue({ items: [mockBrand], total: 1 })
    renderWithClient(<GearModal record={null} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'My Guitar' } })
    await selectFromSearch('Search brands...', 'Fend', 'Fender')
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
      '/gearlist/gear',
      expect.objectContaining({ brand_id: 'brand-uuid-1' })
    ))
  })

  it('includes model_id in create payload when a model is searched and selected', async () => {
    jest.useFakeTimers()
    mockCreate.mockResolvedValue({ ...mockGear, gear_id: 'new-id' })
    mockListPaged.mockResolvedValue({ items: [mockModel], total: 1 })
    renderWithClient(<GearModal record={null} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'My Guitar' } })
    await selectFromSearch('Search models...', 'Strat', 'Fender Stratocaster')
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
      '/gearlist/gear',
      expect.objectContaining({ model_id: 'model-uuid-1' })
    ))
  })

  it('sends model_id as null after selecting then clearing a model', async () => {
    jest.useFakeTimers()
    mockCreate.mockResolvedValue({ ...mockGear, gear_id: 'new-id' })
    mockListPaged.mockResolvedValue({ items: [mockModel], total: 1 })
    renderWithClient(<GearModal record={null} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'My Guitar' } })
    await selectFromSearch('Search models...', 'Strat', 'Fender Stratocaster')
    const clearBtn = screen.getByPlaceholderText('Search models...').parentElement?.querySelector('button')
    if (clearBtn) fireEvent.click(clearBtn)
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
      '/gearlist/gear',
      expect.objectContaining({ model_id: null })
    ))
  })
})

describe('GearModal — edit mode (non-guitar)', () => {
  const ampGear: Gear = { ...mockGear, gear_type_id: 'a1b2c3d4-0002-0000-0000-000000000002', gear_type_name: 'Amp' }

  beforeEach(() => jest.clearAllMocks())

  it('does not show guitar-specific fields for non-guitar types', () => {
    renderWithClient(<GearModal record={ampGear} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(screen.queryByLabelText(/pickup config/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/strings/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/tuning/i)).not.toBeInTheDocument()
  })
})
