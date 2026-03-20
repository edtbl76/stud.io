import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Table, Column } from '@tanstack/react-table'
import { DataTableToolbar } from '@/components/DataTableToolbar'

type Row = { id: string; name: string }

function makeCol(overrides: Partial<Column<Row, unknown>> = {}): Column<Row, unknown> {
  return {
    id: 'name',
    columnDef: { header: 'Name' },
    getIsVisible: () => true,
    getToggleVisibilityHandler: () => jest.fn(),
    ...overrides,
  } as unknown as Column<Row, unknown>
}

function makeTable(cols: Column<Row, unknown>[] = [makeCol()]): Table<Row> {
  return {
    getAllLeafColumns: () => cols,
  } as unknown as Table<Row>
}

describe('DataTableToolbar', () => {
  it('renders the Columns button', () => {
    render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
      />
    )
    expect(screen.getByText('Columns')).toBeInTheDocument()
  })

  it('does not show clear filters button when count is 0', () => {
    render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
      />
    )
    expect(screen.queryByText(/Clear/)).not.toBeInTheDocument()
  })

  it('shows clear filters button when activeFilterCount > 0', () => {
    render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={2}
        onClearFilters={jest.fn()}
      />
    )
    expect(screen.getByText('Clear 2 filters')).toBeInTheDocument()
  })

  it('uses singular "filter" for count of 1', () => {
    render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={1}
        onClearFilters={jest.fn()}
      />
    )
    expect(screen.getByText('Clear 1 filter')).toBeInTheDocument()
  })

  it('calls onClearFilters when clear button is clicked', () => {
    const onClearFilters = jest.fn()
    render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={1}
        onClearFilters={onClearFilters}
      />
    )
    fireEvent.click(screen.getByText('Clear 1 filter'))
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('shows column menu when Columns button is clicked', () => {
    render(
      <DataTableToolbar
        table={makeTable([makeCol({ id: 'name', columnDef: { header: 'Name' } as never })])}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
      />
    )
    fireEvent.click(screen.getByText('Columns'))
    expect(screen.getByText('Name')).toBeInTheDocument()
  })

  it('excludes __select__ column from the column menu', () => {
    const cols = [
      makeCol({ id: '__select__', columnDef: { header: 'Select' } as never }),
      makeCol({ id: 'name', columnDef: { header: 'Name' } as never }),
    ]
    render(
      <DataTableToolbar
        table={makeTable(cols)}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
      />
    )
    fireEvent.click(screen.getByText('Columns'))
    expect(screen.queryByText('Select')).not.toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
  })

  it('uses col.id as label when header is not a string', () => {
    const cols = [
      makeCol({ id: 'custom_col', columnDef: { header: () => <span>JSX Header</span> } as never }),
    ]
    render(
      <DataTableToolbar
        table={makeTable(cols)}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
      />
    )
    fireEvent.click(screen.getByText('Columns'))
    expect(screen.getByText('custom_col')).toBeInTheDocument()
  })
})
