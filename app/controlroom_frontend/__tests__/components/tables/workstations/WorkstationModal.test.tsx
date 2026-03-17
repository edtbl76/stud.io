import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkstationModal } from '@/components/tables/workstations/WorkstationModal'
import type { Workstation } from '@/lib/types'

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

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const mockWorkstation: Workstation = {
  workstation_id: 'ws-1',
  tool_name: 'Main Rig',
  brand_id: null,
  brand_name: null,
  full_tool_name: 'Main Rig',
  version: '2024',
  tool_type_ids: null,
  tool_types: [],
  plugin_format_ids: null,
  plugin_formats: [],
  tag_ids: null,
  tags: [],
  description: 'Primary recording setup',
  workflow_notes: 'Use for all tracking',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('WorkstationModal — view mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows create title when record is null', () => {
    renderWithClient(<WorkstationModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('New Workstation')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(<WorkstationModal record={mockWorkstation} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: Main Rig/i)).toBeInTheDocument()
  })

  it('displays record fields in view mode', () => {
    renderWithClient(<WorkstationModal record={mockWorkstation} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('Primary recording setup')).toBeInTheDocument()
    expect(screen.getByText('Use for all tracking')).toBeInTheDocument()
  })
})

describe('WorkstationModal — create mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders required form field in create mode', () => {
    renderWithClient(<WorkstationModal record={null} onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByLabelText(/tool name/i)).toBeInTheDocument()
  })

  it('calls api.create with form data on save', async () => {
    mockCreate.mockResolvedValue({ ...mockWorkstation, workstation_id: 'new-id' })
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<WorkstationModal record={null} onClose={onClose} onMutate={onMutate} />)

    fireEvent.change(screen.getByLabelText(/tool name/i), { target: { value: 'B Rig' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('/workstations', expect.objectContaining({ tool_name: 'B Rig' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('shows error message when create fails', async () => {
    mockCreate.mockRejectedValue(new Error('Name is required'))
    renderWithClient(<WorkstationModal record={null} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Name is required')).toBeInTheDocument())
  })
})

describe('WorkstationModal — edit mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders form fields with existing values', () => {
    renderWithClient(<WorkstationModal record={mockWorkstation} onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByDisplayValue('Main Rig')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2024')).toBeInTheDocument()
  })

  it('calls api.update on save', async () => {
    mockUpdate.mockResolvedValue(mockWorkstation)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<WorkstationModal record={mockWorkstation} onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Main Rig'), { target: { value: 'Studio A Rig' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('/workstations', 'ws-1', expect.objectContaining({ tool_name: 'Studio A Rig' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('calls api.delete and closes after confirming delete', async () => {
    mockDelete.mockResolvedValue(undefined)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<WorkstationModal record={mockWorkstation} onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/workstations', 'ws-1'))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('shows error when save fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Update failed'))
    renderWithClient(<WorkstationModal record={mockWorkstation} onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Update failed')).toBeInTheDocument())
  })
})
