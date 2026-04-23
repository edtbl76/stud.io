import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigModal } from '@/components/tables/config/ConfigModal'
import type { LookupOut } from '@/lib/types'

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

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const mockConfig: LookupOut = {
  type_id: 'type-1',
  type_name: 'Reverb',
  type_description: 'Room simulation effects',
}

describe('ConfigModal — view mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows create title when record is null', () => {
    renderWithClient(<ConfigModal record={null} slug="effect-types" onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('New Entry')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(<ConfigModal record={mockConfig} slug="effect-types" onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Reverb/i)).toBeInTheDocument()
  })

  it('displays record fields in view mode', () => {
    renderWithClient(<ConfigModal record={mockConfig} slug="effect-types" onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getAllByText('Reverb').length).toBeGreaterThan(0)
    expect(screen.getByText('Room simulation effects')).toBeInTheDocument()
  })
})

describe('ConfigModal — create mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders required form field in create mode', () => {
    renderWithClient(<ConfigModal record={null} slug="effect-types" onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument()
  })

  it('calls api.create with form data on save', async () => {
    mockCreate.mockResolvedValue({ ...mockConfig, type_id: 'new-id' })
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<ConfigModal record={null} slug="effect-types" onClose={onClose} onMutate={onMutate} />)

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Delay' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('/studio/config/effect-types', expect.objectContaining({ type_name: 'Delay' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('shows error message when create fails', async () => {
    mockCreate.mockRejectedValue(new Error('Name already exists'))
    renderWithClient(<ConfigModal record={null} slug="effect-types" onClose={() => {}} onMutate={() => {}} />)

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Reverb' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Name already exists')).toBeInTheDocument())
  })
})

describe('ConfigModal — edit mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders form fields with existing values', () => {
    renderWithClient(<ConfigModal record={mockConfig} slug="effect-types" onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByDisplayValue('Reverb')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Room simulation effects')).toBeInTheDocument()
  })

  it('calls api.update on save', async () => {
    mockUpdate.mockResolvedValue(mockConfig)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<ConfigModal record={mockConfig} slug="effect-types" onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Reverb'), { target: { value: 'Reverb (Hall)' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('/studio/config/effect-types', 'type-1', expect.objectContaining({ type_name: 'Reverb (Hall)' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('calls api.delete and closes after confirming delete', async () => {
    mockDelete.mockResolvedValue(undefined)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<ConfigModal record={mockConfig} slug="effect-types" onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/studio/config/effect-types', 'type-1'))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('shows error when save fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Update failed'))
    renderWithClient(<ConfigModal record={mockConfig} slug="effect-types" onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Update failed')).toBeInTheDocument())
  })
})
