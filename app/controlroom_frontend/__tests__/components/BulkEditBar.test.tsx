import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BulkEditBar } from '@/components/BulkEditBar'
import type { BulkEditField } from '@/lib/bulkEdit'

const mockApiUpdate = jest.fn()
const mockApiDelete = jest.fn()

jest.mock('@/lib/api', () => ({
  api: {
    update: (...args: unknown[]) => mockApiUpdate(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}))

// MultiSelect uses Radix Popover which doesn't render in jsdom.
// Mock it as a simple controlled input so we can drive selection in tests.
jest.mock('@/components/ui/MultiSelect', () => ({
  MultiSelect: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string[]
    onChange: (v: string[]) => void
    placeholder?: string
  }) => (
    <input
      data-testid="multi-select-mock"
      value={value.join(',')}
      onChange={(e) => onChange(e.target.value ? e.target.value.split(',') : [])}
      placeholder={placeholder}
    />
  ),
}))

// ParentSelect mock: renders current parentValue as chips and an add button for testing.
jest.mock('@/components/ui/ParentSelect', () => ({
  ParentSelect: ({
    value,
    selectedParents,
    onChange,
  }: {
    value: Array<{ table_name: string; id: string }>
    selectedParents: Array<{ table_name: string; id: string; name: string | null }>
    onChange: (ids: Array<{ table_name: string; id: string }>, refs: Array<{ table_name: string; id: string; name: string | null }>) => void
  }) => (
    <div data-testid="parent-select-mock">
      {selectedParents.map((p) => (
        <span key={`${p.table_name}:${p.id}`} data-testid={`chip-${p.id}`}>
          {p.name ?? p.id}
          <button
            onClick={() => {
              const next = value.filter((v) => !(v.table_name === p.table_name && v.id === p.id))
              const nextRefs = selectedParents.filter((r) => !(r.table_name === p.table_name && r.id === p.id))
              onChange(next, nextRefs)
            }}
            aria-label={`Remove ${p.name ?? p.id}`}
          >×</button>
        </span>
      ))}
      <button
        data-testid="add-parent"
        onClick={() => {
          const newP = { table_name: 'effects', id: 'new-1', name: 'New Effect' }
          onChange([...value, { table_name: newP.table_name, id: newP.id }], [...selectedParents, newP])
        }}
      >Add Parent</button>
    </div>
  ),
}))

const textField: BulkEditField = { key: 'version', label: 'Version', type: 'text' }
const multiField: BulkEditField = {
  key: 'tag_ids',
  label: 'Tags',
  type: 'multiselect',
  configSlug: 'tag-types',
}
const singleField: BulkEditField = {
  key: 'entity_type_id',
  label: 'Entity Type',
  type: 'singleselect',
  configSlug: 'entity-types',
}
const parentField: BulkEditField = { key: 'parent_ids', label: 'Parents', type: 'parentsearch' }

const rows: Record<string, unknown>[] = [
  { id: '1', version: null, tag_ids: [], entity_type_id: null, parents: [] },
  { id: '2', version: '1.0', tag_ids: ['t1'], entity_type_id: 'e1', parents: [{ table_name: 'effects', id: 'e-1', name: 'Reverb' }] },
]

const parentRows: Record<string, unknown>[] = [
  { id: '1', parents: [{ table_name: 'effects', id: 'e-1', name: 'Reverb' }] },
  { id: '2', parents: [{ table_name: 'effects', id: 'e-1', name: 'Reverb' }, { table_name: 'instruments', id: 'i-1', name: 'Prophet 5' }] },
]

function renderBar(
  fields: BulkEditField[] = [textField],
  selectedRows: Record<string, unknown>[] = rows,
) {
  const onApply = jest.fn()
  const onClear = jest.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const getRowId = (r: Record<string, unknown>) => r.id as string
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <BulkEditBar
        selectedRows={selectedRows}
        fields={fields}
        endpoint="/test"
        getRowId={getRowId}
        onApply={onApply}
        onClear={onClear}
      />
    </QueryClientProvider>
  )
  const rerenderWithRows = (nextRows: Record<string, unknown>[]) =>
    rerender(
      <QueryClientProvider client={client}>
        <BulkEditBar
          selectedRows={nextRows}
          fields={fields}
          endpoint="/test"
          getRowId={getRowId}
          onApply={onApply}
          onClear={onClear}
        />
      </QueryClientProvider>
    )
  return { onApply, onClear, rerenderWithRows }
}

describe('BulkEditBar', () => {
  beforeEach(() => {
    mockApiUpdate.mockClear()
    mockApiUpdate.mockResolvedValue({})
    mockApiDelete.mockClear()
    mockApiDelete.mockResolvedValue(undefined)
  })

  it('shows the selected row count', () => {
    renderBar()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('selected')).toBeInTheDocument()
  })

  it('calls onClear when the × button is clicked', () => {
    const { onClear } = renderBar()
    fireEvent.click(screen.getByLabelText('Clear selection'))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('renders a field picker with all fields', () => {
    renderBar([textField, multiField])
    const select = screen.getByLabelText('Select field to bulk edit')
    expect(select).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Version' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Tags' })).toBeInTheDocument()
  })

  it('shows a text input when a text field is selected', () => {
    renderBar([textField])
    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), {
      target: { value: 'version' },
    })
    expect(screen.getByPlaceholderText('Set Version…')).toBeInTheDocument()
  })

  it('Apply button is disabled until a value is entered for text field', () => {
    renderBar([textField])
    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), {
      target: { value: 'version' },
    })
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Set Version…'), {
      target: { value: '2.0' },
    })
    expect(screen.getByRole('button', { name: /apply/i })).not.toBeDisabled()
  })

  it('applies text value to all selected rows via PATCH', async () => {
    const { onApply } = renderBar([textField])
    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), {
      target: { value: 'version' },
    })
    fireEvent.change(screen.getByPlaceholderText('Set Version…'), {
      target: { value: '3.0' },
    })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(mockApiUpdate).toHaveBeenCalledTimes(2))
    expect(mockApiUpdate).toHaveBeenCalledWith('/test', '1', { version: '3.0' })
    expect(mockApiUpdate).toHaveBeenCalledWith('/test', '2', { version: '3.0' })
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
  })

  it('merges tag_ids with existing values for multiselect fields', async () => {
    const { onApply } = renderBar([multiField])

    // Row 1 has tag_ids: [], row 2 has tag_ids: ['t1']
    // After setting tag-a via the mock MultiSelect and applying:
    // row 1 should get ['tag-a'], row 2 should get ['t1', 'tag-a']

    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), {
      target: { value: 'tag_ids' },
    })
    fireEvent.change(screen.getByTestId('multi-select-mock'), {
      target: { value: 'tag-a' },
    })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() => expect(mockApiUpdate).toHaveBeenCalledTimes(2))
    expect(mockApiUpdate).toHaveBeenCalledWith('/test', '1', { tag_ids: ['tag-a'] })
    expect(mockApiUpdate).toHaveBeenCalledWith('/test', '2', { tag_ids: ['t1', 'tag-a'] })
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
  })

  it('does not duplicate existing IDs when merging', async () => {
    renderBar([multiField])

    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), {
      target: { value: 'tag_ids' },
    })
    // Set value to 't1' which already exists in row 2
    fireEvent.change(screen.getByTestId('multi-select-mock'), {
      target: { value: 't1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() => expect(mockApiUpdate).toHaveBeenCalledTimes(2))
    // row 2 already has 't1'; merged result should still be ['t1'] (no duplicate)
    expect(mockApiUpdate).toHaveBeenCalledWith('/test', '2', { tag_ids: ['t1'] })
  })

  it('shows an error summary when some updates fail', async () => {
    mockApiUpdate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Server error'))
    renderBar([textField])
    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), {
      target: { value: 'version' },
    })
    fireEvent.change(screen.getByPlaceholderText('Set Version…'), {
      target: { value: '2.0' },
    })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(screen.getByText(/1 updated, 1 failed/i)).toBeInTheDocument())
  })

  it('resets value input when the field is changed', () => {
    renderBar([textField, singleField])
    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), {
      target: { value: 'version' },
    })
    fireEvent.change(screen.getByPlaceholderText('Set Version…'), {
      target: { value: '2.0' },
    })
    // Switch fields — text value should be gone
    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), {
      target: { value: 'entity_type_id' },
    })
    expect(screen.queryByPlaceholderText('Set Version…')).not.toBeInTheDocument()
  })

  it('shows no Apply button when no field is selected', () => {
    renderBar([textField])
    expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument()
  })

  it('shows Delete button in the bar', () => {
    renderBar()
    expect(screen.getByRole('button', { name: /delete selected/i })).toBeInTheDocument()
  })

  it('shows confirmation prompt after Delete click', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /delete selected/i }))
    expect(screen.getByText(/delete 2 records/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('cancels bulk delete and restores Delete button', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /delete selected/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByText(/delete 2 records/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete selected/i })).toBeInTheDocument()
  })

  it('calls api.delete for each row and invokes onApply on success', async () => {
    const { onApply } = renderBar()
    fireEvent.click(screen.getByRole('button', { name: /delete selected/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(mockApiDelete).toHaveBeenCalledTimes(2))
    expect(mockApiDelete).toHaveBeenCalledWith('/test', '1')
    expect(mockApiDelete).toHaveBeenCalledWith('/test', '2')
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
  })

  it('shows error summary when some deletes fail', async () => {
    mockApiDelete
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Server error'))
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /delete selected/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(screen.getByText(/1 deleted, 1 failed/i)).toBeInTheDocument())
  })

  it('parentsearch: pre-populates with union of existing parents as chips', () => {
    renderBar([parentField], parentRows)
    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), { target: { value: 'parent_ids' } })
    expect(screen.getByTestId('chip-e-1')).toBeInTheDocument()
    expect(screen.getByTestId('chip-i-1')).toBeInTheDocument()
  })

  it('parentsearch: Apply button is enabled immediately with no changes', () => {
    renderBar([parentField], parentRows)
    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), { target: { value: 'parent_ids' } })
    expect(screen.getByRole('button', { name: /apply/i })).not.toBeDisabled()
  })

  it('parentsearch: adding a new parent merges it with each row\'s existing parents', async () => {
    const { onApply } = renderBar([parentField], parentRows)
    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), { target: { value: 'parent_ids' } })
    fireEvent.click(screen.getByTestId('add-parent'))
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(mockApiUpdate).toHaveBeenCalledTimes(2))
    expect(mockApiUpdate).toHaveBeenCalledWith('/test', '1', {
      parent_ids: [{ table_name: 'effects', id: 'e-1' }, { table_name: 'effects', id: 'new-1' }],
    })
    expect(mockApiUpdate).toHaveBeenCalledWith('/test', '2', {
      parent_ids: [{ table_name: 'effects', id: 'e-1' }, { table_name: 'instruments', id: 'i-1' }, { table_name: 'effects', id: 'new-1' }],
    })
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
  })

  it('parentsearch: removing a parent removes it from all rows that had it', async () => {
    const { onApply } = renderBar([parentField], parentRows)
    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), { target: { value: 'parent_ids' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Reverb' }))
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(mockApiUpdate).toHaveBeenCalledTimes(2))
    expect(mockApiUpdate).toHaveBeenCalledWith('/test', '1', { parent_ids: [] })
    expect(mockApiUpdate).toHaveBeenCalledWith('/test', '2', { parent_ids: [{ table_name: 'instruments', id: 'i-1' }] })
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
  })

  it('parentsearch: chips and Apply payload recompute when selectedRows changes while parent_ids is active', async () => {
    const newRows: Record<string, unknown>[] = [
      { id: '3', parents: [{ table_name: 'instruments', id: 'i-2', name: 'Juno-106' }] },
    ]
    const { onApply, rerenderWithRows } = renderBar([parentField], parentRows)

    // Select parent_ids: chips show union of original parentRows (e-1 and i-1)
    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), { target: { value: 'parent_ids' } })
    expect(screen.getByTestId('chip-e-1')).toBeInTheDocument()
    expect(screen.getByTestId('chip-i-1')).toBeInTheDocument()

    // Change selectedRows while parent_ids is still active
    rerenderWithRows(newRows)

    // Chips should reflect the new row's parents only
    await waitFor(() => expect(screen.queryByTestId('chip-e-1')).not.toBeInTheDocument())
    expect(screen.queryByTestId('chip-i-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('chip-i-2')).toBeInTheDocument()

    // Apply should compute payloads from the new selectedRows
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(mockApiUpdate).toHaveBeenCalledTimes(1))
    expect(mockApiUpdate).toHaveBeenCalledWith('/test', '3', {
      parent_ids: [{ table_name: 'instruments', id: 'i-2' }],
    })
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
  })

  it('parentsearch: Apply button is enabled when all chips are removed (clear-all)', async () => {
    // Rows start with parents; user removes all chips — Apply must still be enabled
    // so they can intentionally bulk-clear parents across all selected rows.
    renderBar([parentField], parentRows)
    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), { target: { value: 'parent_ids' } })

    // Remove all chips (mock remove buttons use aria-label "Remove {name}")
    fireEvent.click(screen.getByRole('button', { name: /remove reverb/i }))
    fireEvent.click(screen.getByRole('button', { name: /remove prophet 5/i }))

    expect(screen.getByRole('button', { name: /apply/i })).not.toBeDisabled()
  })

  it('applies singleselect value to all selected rows via PATCH', async () => {
    const { onApply } = renderBar([singleField])
    fireEvent.change(screen.getByLabelText('Select field to bulk edit'), {
      target: { value: 'entity_type_id' },
    })
    fireEvent.change(screen.getByTestId('multi-select-mock'), {
      target: { value: 'e2' },
    })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(mockApiUpdate).toHaveBeenCalledTimes(2))
    expect(mockApiUpdate).toHaveBeenCalledWith('/test', '1', { entity_type_id: 'e2' })
    expect(mockApiUpdate).toHaveBeenCalledWith('/test', '2', { entity_type_id: 'e2' })
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
  })
})
