import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Table, HeaderGroup, Header, Column } from '@tanstack/react-table'
import { DataTableHeader } from '@/components/DataTableHeader'

type Row = { id: string; name: string }

function makeFilterableHeader(
  colId: string,
  overrides: Partial<Column<Row, unknown>> = {},
): Header<Row, unknown> {
  return {
    id: colId,
    isPlaceholder: false,
    column: {
      id: colId,
      columnDef: { header: colId === 'name' ? 'Name' : 'Version' },
      getCanSort: () => false,
      getIsSorted: () => false,
      getToggleSortingHandler: () => undefined,
      getCanFilter: () => true,
      getFilterValue: () => '',
      setFilterValue: jest.fn(),
      getCanResize: () => false,
      getIsResizing: () => false,
      ...overrides,
    } as unknown as Column<Row, unknown>,
    getSize: () => 150,
    getContext: () => ({}) as never,
    getResizeHandler: () => jest.fn(),
  } as unknown as Header<Row, unknown>
}

function makeNonFilterableHeader(colId: string): Header<Row, unknown> {
  return {
    id: colId,
    isPlaceholder: false,
    column: {
      id: colId,
      columnDef: { header: 'Tags' },
      getCanSort: () => false,
      getIsSorted: () => false,
      getToggleSortingHandler: () => undefined,
      getCanFilter: () => false,
      getFilterValue: () => '',
      setFilterValue: jest.fn(),
      getCanResize: () => false,
      getIsResizing: () => false,
    } as unknown as Column<Row, unknown>,
    getSize: () => 200,
    getContext: () => ({}) as never,
    getResizeHandler: () => jest.fn(),
  } as unknown as Header<Row, unknown>
}

function makeTable(headers: Header<Row, unknown>[]): Table<Row> {
  const headerGroup: HeaderGroup<Row> = {
    id: 'group-0',
    headers,
    depth: 0,
    getVisibleCells: jest.fn(),
  } as unknown as HeaderGroup<Row>
  return {
    getHeaderGroups: () => [headerGroup],
  } as unknown as Table<Row>
}

describe('DataTableHeader manual filtering', () => {
  it('renders filter input for filterable column when manualFiltering=true', () => {
    render(
      <table>
        <DataTableHeader
          table={makeTable([makeFilterableHeader('name')])}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
          manualFiltering
          externalFilters={{}}
          onExternalFiltersChange={jest.fn()}
        />
      </table>
    )
    expect(screen.getByPlaceholderText('Filter…')).toBeInTheDocument()
  })

  it('does not render filter input for non-filterable column when manualFiltering=true', () => {
    render(
      <table>
        <DataTableHeader
          table={makeTable([makeNonFilterableHeader('tags')])}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
          manualFiltering
          externalFilters={{}}
          onExternalFiltersChange={jest.fn()}
        />
      </table>
    )
    expect(screen.queryByPlaceholderText('Filter…')).not.toBeInTheDocument()
  })

  it('shows current external filter value in the input', () => {
    render(
      <table>
        <DataTableHeader
          table={makeTable([makeFilterableHeader('name')])}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
          manualFiltering
          externalFilters={{ name: 'moog' }}
          onExternalFiltersChange={jest.fn()}
        />
      </table>
    )
    expect((screen.getByPlaceholderText('Filter…') as HTMLInputElement).value).toBe('moog')
  })

  it('calls onExternalFiltersChange with updated value on input change', () => {
    const onChange = jest.fn()
    render(
      <table>
        <DataTableHeader
          table={makeTable([makeFilterableHeader('name')])}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
          manualFiltering
          externalFilters={{}}
          onExternalFiltersChange={onChange}
        />
      </table>
    )
    fireEvent.change(screen.getByPlaceholderText('Filter…'), { target: { value: 'mono' } })
    expect(onChange).toHaveBeenCalledWith({ name: 'mono' })
  })

  it('removes key when input is cleared to empty string', () => {
    const onChange = jest.fn()
    render(
      <table>
        <DataTableHeader
          table={makeTable([makeFilterableHeader('name')])}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
          manualFiltering
          externalFilters={{ name: 'moog' }}
          onExternalFiltersChange={onChange}
        />
      </table>
    )
    fireEvent.change(screen.getByPlaceholderText('Filter…'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('shows × clear button when filter value is non-empty', () => {
    render(
      <table>
        <DataTableHeader
          table={makeTable([makeFilterableHeader('name')])}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
          manualFiltering
          externalFilters={{ name: 'moog' }}
          onExternalFiltersChange={jest.fn()}
        />
      </table>
    )
    expect(screen.getByLabelText('Clear filter')).toBeInTheDocument()
  })

  it('does not show × clear button when filter value is empty', () => {
    render(
      <table>
        <DataTableHeader
          table={makeTable([makeFilterableHeader('name')])}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
          manualFiltering
          externalFilters={{}}
          onExternalFiltersChange={jest.fn()}
        />
      </table>
    )
    expect(screen.queryByLabelText('Clear filter')).not.toBeInTheDocument()
  })

  it('calls onExternalFiltersChange without the key when × is clicked', () => {
    const onChange = jest.fn()
    render(
      <table>
        <DataTableHeader
          table={makeTable([makeFilterableHeader('name')])}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
          manualFiltering
          externalFilters={{ name: 'moog', version: '2.0' }}
          onExternalFiltersChange={onChange}
        />
      </table>
    )
    fireEvent.click(screen.getByLabelText('Clear filter'))
    expect(onChange).toHaveBeenCalledWith({ version: '2.0' })
  })
})
