import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToolModal } from '@/components/tables/tools/ToolModal'
import type { Tool } from '@/lib/types'

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

jest.mock('@/components/tables/scanner/PluginPathsEditor', () => ({
  PluginPathsEditor: ({ value }: { value: unknown[] }) => (
    <div data-testid="plugin-paths-editor">{value.length} paths</div>
  ),
}))

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const mockTool: Tool = {
  tool_id: 'tool-1',
  tool_name: 'iZotope RX',
  brand_id: null,
  brand_name: 'iZotope',
  full_tool_name: 'iZotope RX',
  version: '10',
  model_ids: null,
  models: [],
  tool_type_ids: null,
  tool_types: [],
  plugin_format_ids: null,
  plugin_formats: [],
  tag_ids: null,
  tags: [],
  description: 'Audio repair tool',
  workflow_notes: 'Use for noise removal',
  disk_paths: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('ToolModal — view mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows create title when record is null', () => {
    renderWithClient(<ToolModal record={null} category="admin" onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('New Admin Tool')).toBeInTheDocument()
  })

  it('shows edit title when editing an existing record', () => {
    renderWithClient(<ToolModal record={mockTool} category="admin" onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/Edit: iZotope RX/i)).toBeInTheDocument()
  })

  it('displays record fields in view mode', () => {
    renderWithClient(<ToolModal record={mockTool} category="admin" onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByText('Audio repair tool')).toBeInTheDocument()
    expect(screen.getByText('Use for noise removal')).toBeInTheDocument()
  })
})

describe('ToolModal — create mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders required form field in create mode', () => {
    renderWithClient(<ToolModal record={null} category="admin" onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByLabelText(/tool name/i)).toBeInTheDocument()
  })

  it('calls api.create with form data on save', async () => {
    mockCreate.mockResolvedValue({ ...mockTool, tool_id: 'new-id' })
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<ToolModal record={null} category="admin" onClose={onClose} onMutate={onMutate} />)

    fireEvent.change(screen.getByLabelText(/tool name/i), { target: { value: 'Spectral Repair' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('/studio/tools/admin', expect.objectContaining({ tool_name: 'Spectral Repair' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('shows error message when create fails', async () => {
    mockCreate.mockRejectedValue(new Error('Name is required'))
    renderWithClient(<ToolModal record={null} category="admin" onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Name is required')).toBeInTheDocument())
  })
})

describe('ToolModal — edit mode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders form fields with existing values', () => {
    renderWithClient(<ToolModal record={mockTool} category="admin" onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByDisplayValue('iZotope RX')).toBeInTheDocument()
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()
  })

  it('calls api.update on save', async () => {
    mockUpdate.mockResolvedValue(mockTool)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<ToolModal record={mockTool} category="admin" onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('iZotope RX'), { target: { value: 'iZotope RX 11' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('/studio/tools/admin', 'tool-1', expect.objectContaining({ tool_name: 'iZotope RX 11' })))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('calls api.delete and closes after confirming delete', async () => {
    mockDelete.mockResolvedValue(undefined)
    const onMutate = jest.fn()
    const onClose = jest.fn()
    renderWithClient(<ToolModal record={mockTool} category="admin" onClose={onClose} onMutate={onMutate} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/studio/tools/admin', 'tool-1'))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('shows error when save fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Update failed'))
    renderWithClient(<ToolModal record={mockTool} category="admin" onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText('Update failed')).toBeInTheDocument())
  })
})

describe('ToolModal — disk_paths', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders PluginPathsEditor in view mode', () => {
    renderWithClient(<ToolModal record={mockTool} category="admin" onClose={() => {}} onMutate={() => {}} />)
    expect(screen.getByTestId('plugin-paths-editor')).toBeInTheDocument()
  })

  it('renders PluginPathsEditor in edit mode', () => {
    renderWithClient(<ToolModal record={mockTool} category="admin" onClose={() => {}} onMutate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByTestId('plugin-paths-editor')).toBeInTheDocument()
  })

  it('includes disk_paths in update payload', async () => {
    mockUpdate.mockResolvedValue(mockTool)
    renderWithClient(<ToolModal record={mockTool} category="admin" onClose={() => {}} onMutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
      '/studio/tools/admin', 'tool-1',
      expect.objectContaining({ disk_paths: [] }),
    ))
  })
})
