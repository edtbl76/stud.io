import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BulkEditBar } from '@/components/BulkEditBar'
import type { BulkEditField } from '@/lib/bulkEdit'

const mockApiUpdate = jest.fn()

jest.mock('@/lib/api', () => ({
  api: {
    update: (...args: unknown[]) => mockApiUpdate(...args),
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

const rows: Record<string, unknown>[] = [
  { id: '1', version: null, tag_ids: [], entity_type_id: null },
  { id: '2', version: '1.0', tag_ids: ['t1'], entity_type_id: 'e1' },
]

function renderBar(
  fields: BulkEditField[] = [textField],
  selectedRows: Record<string, unknown>[] = rows,
) {
  const onApply = jest.fn()
  const onClear = jest.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <BulkEditBar
        selectedRows={selectedRows}
        fields={fields}
        endpoint="/test"
        getRowId={(r) => r.id as string}
        onApply={onApply}
        onClear={onClear}
      />
    </QueryClientProvider>
  )
  return { onApply, onClear }
}

describe('BulkEditBar', () => {
  beforeEach(() => {
    mockApiUpdate.mockClear()
    mockApiUpdate.mockResolvedValue({})
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
