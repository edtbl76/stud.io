import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LibraryModal } from '@/components/tables/libraries/LibraryModal'
import type { Library } from '@/lib/types'

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

const mockLibrary: Library = {
  library_id: 'lib-1',
  library_name: 'Orchestral Essentials',
  brand_id: null,
  brand_name: 'Spitfire',
  full_library_name: 'Spitfire Orchestral Essentials',
  model_ids: null,
  models: [],
  tag_ids: null,
  tags: [],
  parents: [],
  description: 'Full orchestral sample pack',
  instrument_notes: 'All instruments recorded at Abbey Road',
  recording_notes: null,
  workflow_notes: null,
  attributes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('LibraryModal — view mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows create title when record is null', () => {
    renderWithClient(<LibraryModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('New Library')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(<LibraryModal record={mockLibrary} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Spitfire Orchestral Essentials/i)).toBeInTheDocument()
  })

  it('displays record fields in view mode', () => {
    renderWithClient(<LibraryModal record={mockLibrary} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('Full orchestral sample pack')).toBeInTheDocument()
    expect(screen.getByText('All instruments recorded at Abbey Road')).toBeInTheDocument()
  })
})

describe('LibraryModal — create mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders required form field in create mode', () => {
    renderWithClient(<LibraryModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByLabelText(/library name/i)).toBeInTheDocument()
  })

  it('calls api.create with form data on save', async () => {
    mockCreate.mockResolvedValue({ ...mockLibrary, library_id: 'new-id' })
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<LibraryModal record={null} onClose={onClose} onMutate={onMutate} />)

    fireEvent.change(screen.getByLabelText(/library name/i), { target: { value: 'Cinematic Strings' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('/libraries', expect.objectContaining({ library_name: 'Cinematic Strings' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('shows error message when create fails', async () => {
    mockCreate.mockRejectedValue(new Error('Name is required'))
    renderWithClient(<LibraryModal record={null} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Name is required')).toBeInTheDocument())
  })
})

describe('LibraryModal — edit mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders form fields with existing values', () => {
    renderWithClient(<LibraryModal record={mockLibrary} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByDisplayValue('Orchestral Essentials')).toBeInTheDocument()
  })

  it('calls api.update on save', async () => {
    mockUpdate.mockResolvedValue(mockLibrary)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<LibraryModal record={mockLibrary} onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Orchestral Essentials'), { target: { value: 'Orchestral Pro' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('/libraries', 'lib-1', expect.objectContaining({ library_name: 'Orchestral Pro' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('calls api.delete and closes after confirming delete', async () => {
    mockDelete.mockResolvedValue(undefined)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<LibraryModal record={mockLibrary} onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/libraries', 'lib-1'))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('includes model_ids in update payload even when empty', async () => {
    mockUpdate.mockResolvedValue(mockLibrary)
    renderWithClient(<LibraryModal record={mockLibrary} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Orchestral Essentials'), { target: { value: 'Orchestral Pro' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
      '/libraries', 'lib-1',
      expect.objectContaining({ model_ids: [] }),
    ))
  })

  it('includes parent_ids in update payload even when empty', async () => {
    mockUpdate.mockResolvedValue(mockLibrary)
    renderWithClient(<LibraryModal record={mockLibrary} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Orchestral Essentials'), { target: { value: 'Orchestral Pro' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
      '/libraries', 'lib-1',
      expect.objectContaining({ parent_ids: [] }),
    ))
  })

  async function saveWithWorkflowNotes(value: string | null) {
    const record = { ...mockLibrary, workflow_notes: value }
    mockUpdate.mockResolvedValue(record)
    renderWithClient(<LibraryModal record={record} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
  }

  it.each([
    ['empty string', '', null],
    ['whitespace-only', '   ', null],
    ['padded text', '  render first  ', 'render first'],
  ])('normalizes workflow_notes: %s sends %s', async (_label, input, expected) => {
    await saveWithWorkflowNotes(input)
    expect(mockUpdate).toHaveBeenCalledWith('/libraries', 'lib-1', expect.objectContaining({ workflow_notes: expected }))
  })

  async function openEditAndSetAttributes(attrValue: string) {
    const record = { ...mockLibrary, attributes: null }
    mockUpdate.mockResolvedValue(record)
    renderWithClient(<LibraryModal record={record} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByPlaceholderText('{}'), { target: { value: attrValue } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
  }

  it('attributes: whitespace-only does not throw and omits attributes from payload', async () => {
    await openEditAndSetAttributes('   ')
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
    expect(mockUpdate.mock.calls[0][2]).not.toHaveProperty('attributes')
  })

  it('attributes: valid JSON is parsed and sent', async () => {
    await openEditAndSetAttributes('{"key":"val"}')
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
      '/libraries', 'lib-1',
      expect.objectContaining({ attributes: { key: 'val' } }),
    ))
  })

  it('attributes: invalid JSON shows error and does not call api.update', async () => {
    renderWithClient(<LibraryModal record={mockLibrary} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByPlaceholderText('{}'), { target: { value: '{bad json}' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/invalid JSON/i)).toBeInTheDocument())
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('shows error when save fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Update failed'))
    renderWithClient(<LibraryModal record={mockLibrary} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Update failed')).toBeInTheDocument())
  })
})
