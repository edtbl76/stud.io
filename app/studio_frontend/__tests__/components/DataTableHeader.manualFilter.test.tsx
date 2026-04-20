import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { Table, HeaderGroup, Header, Column } from '@tanstack/react-table'
import { DataTableHeader } from '@/components/DataTableHeader'
import type { FilterState } from '@/lib/filterOperators'

type Row = { id: string; name: string }

function makeFilterableHeader(colId: string): Header<Row, unknown> {
  return {
    id: colId,
    isPlaceholder: false,
    column: {
      id: colId,
      columnDef: { header: colId, meta: undefined },
      getCanSort: () => false,
      getIsSorted: () => false,
      getToggleSortingHandler: () => undefined,
      getCanFilter: () => true,
      getFilterValue: () => '',
      setFilterValue: jest.fn(),
      getCanResize: () => false,
      getIsResizing: () => false,
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
      columnDef: { header: colId, meta: undefined },
      getCanSort: () => false,
      getIsSorted: () => false,
      getToggleSortingHandler: () => undefined,
      getCanFilter: () => false,
      getFilterValue: () => '',
      setFilterValue: jest.fn(),
      getCanResize: () => false,
      getIsResizing: () => false,
    } as unknown as Column<Row, unknown>,
    getSize: () => 150,
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
  return { getHeaderGroups: () => [headerGroup] } as unknown as Table<Row>
}

describe('DataTableHeader manual filtering', () => {
  it('renders filter cell for filterable column when manualFiltering=true', () => {
    render(
      <table>
        <DataTableHeader
          table={makeTable([makeFilterableHeader('name')])}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
          manualFiltering
          externalFilters={{}}
          onFilterEntryChange={jest.fn()}
        />
      </table>
    )
    // FilterCell renders a text input with placeholder "2+ chars…"
    expect(screen.getByPlaceholderText('2+ chars…')).toBeInTheDocument()
  })

  it('does not render filter input for non-filterable column', () => {
    render(
      <table>
        <DataTableHeader
          table={makeTable([makeNonFilterableHeader('__select__')])}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
          manualFiltering
          externalFilters={{}}
          onFilterEntryChange={jest.fn()}
        />
      </table>
    )
    expect(screen.queryByPlaceholderText('2+ chars…')).not.toBeInTheDocument()
  })

  it('shows active filter value in the text input', () => {
    const filters: FilterState = { name: { value: 'moog', operator: 'contains' } }
    render(
      <table>
        <DataTableHeader
          table={makeTable([makeFilterableHeader('name')])}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
          manualFiltering
          externalFilters={filters}
          onFilterEntryChange={jest.fn()}
        />
      </table>
    )
    expect((screen.getByPlaceholderText('2+ chars…') as HTMLInputElement).value).toBe('moog')
  })

  it('shows clear button when there is an active filter', () => {
    const filters: FilterState = { name: { value: 'moog', operator: 'contains' } }
    render(
      <table>
        <DataTableHeader
          table={makeTable([makeFilterableHeader('name')])}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
          manualFiltering
          externalFilters={filters}
          onFilterEntryChange={jest.fn()}
        />
      </table>
    )
    expect(screen.getByLabelText('Clear filter')).toBeInTheDocument()
  })

  it('does not show clear button when no filter is active', () => {
    render(
      <table>
        <DataTableHeader
          table={makeTable([makeFilterableHeader('name')])}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
          manualFiltering
          externalFilters={{}}
          onFilterEntryChange={jest.fn()}
        />
      </table>
    )
    expect(screen.queryByLabelText('Clear filter')).not.toBeInTheDocument()
  })
})
