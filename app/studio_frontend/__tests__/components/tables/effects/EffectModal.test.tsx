import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EffectModal } from '@/components/tables/effects/EffectModal'
import type { Effect } from '@/lib/types'

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

const mockEffect: Effect = {
  effect_id: 'effect-1',
  effect_name: 'Reverb One',
  brand_id: null,
  brand_name: 'Lexicon',
  full_effect_name: 'Lexicon Reverb One',
  version: '2.0',
  collection: 'Classics',
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
  description: 'Lush reverb',
  workflow_notes: 'Best on drums',
  recording_notes: null,
  artist_reference: null,
  attributes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('EffectModal — view mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows create title when record is null', () => {
    renderWithClient(<EffectModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('New Effect')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(<EffectModal record={mockEffect} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Lexicon Reverb One/i)).toBeInTheDocument()
  })

  it('displays record fields in view mode', () => {
    renderWithClient(<EffectModal record={mockEffect} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('Lush reverb')).toBeInTheDocument()
    expect(screen.getByText('Best on drums')).toBeInTheDocument()
  })
})

describe('EffectModal — create mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders form fields in create mode', () => {
    renderWithClient(<EffectModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByLabelText(/effect name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/version/i)).toBeInTheDocument()
  })

  it('calls api.create with form data on save', async () => {
    mockCreate.mockResolvedValue({ ...mockEffect, effect_id: 'new-id' })
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<EffectModal record={null} onClose={onClose} onMutate={onMutate} />)

    fireEvent.change(screen.getByLabelText(/effect name/i), { target: { value: 'Hall Reverb' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('/studio/session/effects', expect.objectContaining({ effect_name: 'Hall Reverb' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('shows error message when create fails', async () => {
    mockCreate.mockRejectedValue(new Error('Required field missing'))
    renderWithClient(<EffectModal record={null} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Required field missing')).toBeInTheDocument())
  })
})

describe('EffectModal — edit mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders form fields with existing values', () => {
    renderWithClient(<EffectModal record={mockEffect} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByDisplayValue('Reverb One')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2.0')).toBeInTheDocument()
  })

  it('calls api.update on save', async () => {
    mockUpdate.mockResolvedValue(mockEffect)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<EffectModal record={mockEffect} onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Reverb One'), { target: { value: 'Reverb Two' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('/studio/session/effects', 'effect-1', expect.objectContaining({ effect_name: 'Reverb Two' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('calls api.delete and closes after confirming delete', async () => {
    mockDelete.mockResolvedValue(undefined)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<EffectModal record={mockEffect} onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/studio/session/effects', 'effect-1'))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('includes parent_ids in update payload even when empty', async () => {
    mockUpdate.mockResolvedValue(mockEffect)
    renderWithClient(<EffectModal record={mockEffect} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Reverb One'), { target: { value: 'Reverb Two' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
      '/studio/session/effects', 'effect-1',
      expect.objectContaining({ parent_ids: [] }),
    ))
  })

  it('includes model_ids in update payload even when empty', async () => {
    mockUpdate.mockResolvedValue(mockEffect)
    renderWithClient(<EffectModal record={mockEffect} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Reverb One'), { target: { value: 'Reverb Two' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
      '/studio/session/effects', 'effect-1',
      expect.objectContaining({ model_ids: [] }),
    ))
  })

  it('shows error when save fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Update failed'))
    renderWithClient(<EffectModal record={mockEffect} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Update failed')).toBeInTheDocument())
  })
})
