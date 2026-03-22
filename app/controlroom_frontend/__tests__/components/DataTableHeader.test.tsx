import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Table, HeaderGroup, Header, Column } from '@tanstack/react-table'
import { DataTableHeader } from '@/components/DataTableHeader'

type Row = { id: string; name: string }

function makeHeader(overrides: Partial<Header<Row, unknown>> = {}): Header<Row, unknown> {
  return {
    id: 'name',
    isPlaceholder: false,
    column: {
      id: 'name',
      columnDef: { header: 'Name' },
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
    ...overrides,
  } as unknown as Header<Row, unknown>
}

function makeTable(headers: Header<Row, unknown>[] = [makeHeader()]): Table<Row> {
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

describe('DataTableHeader', () => {
  it('renders column header labels', () => {
    render(
      <table>
        <DataTableHeader
          table={makeTable()}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
        />
      </table>
    )
    expect(screen.getByText('Name')).toBeInTheDocument()
  })

  it('renders a filter input when column can filter', () => {
    const headers = [
      makeHeader({
        column: {
          id: 'name',
          columnDef: { header: 'Name' },
          getCanSort: () => false,
          getIsSorted: () => false,
          getToggleSortingHandler: () => undefined,
          getCanFilter: () => true,
          getFilterValue: () => '',
          setFilterValue: jest.fn(),
          getCanResize: () => false,
          getIsResizing: () => false,
        } as unknown as Column<Row, unknown>,
      }),
    ]
    render(
      <table>
        <DataTableHeader
          table={makeTable(headers)}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
        />
      </table>
    )
    expect(screen.getByPlaceholderText('Filter…')).toBeInTheDocument()
  })

  it('does not render a filter input when column cannot filter', () => {
    render(
      <table>
        <DataTableHeader
          table={makeTable()}
          draggingId={null}
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
        />
      </table>
    )
    expect(screen.queryByPlaceholderText('Filter…')).not.toBeInTheDocument()
  })

  it('applies opacity class to dragging column', () => {
    const { container } = render(
      <table>
        <DataTableHeader
          table={makeTable()}
          draggingId="name"
          onDragStart={jest.fn()}
          onDrop={jest.fn()}
        />
      </table>
    )
    const th = container.querySelector('th')
    expect(th?.className).toContain('opacity-40')
  })

  it('calls onDrop when a column is dropped', () => {
    const onDrop = jest.fn()
    const { container } = render(
      <table>
        <DataTableHeader
          table={makeTable()}
          draggingId="other"
          onDragStart={jest.fn()}
          onDrop={onDrop}
        />
      </table>
    )
    const th = container.querySelector('th')!
    fireEvent.drop(th)
    expect(onDrop).toHaveBeenCalledWith(expect.anything(), 'name')
  })
})
