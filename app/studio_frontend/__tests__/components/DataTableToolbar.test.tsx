import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Table, Column } from '@tanstack/react-table'
import { DataTableToolbar } from '@/components/DataTableToolbar'

type Row = { id: string; name: string }

function makeCol(overrides: Partial<Column<Row, unknown>> = {}): Column<Row, unknown> {
  return {
    id: 'name',
    columnDef: { header: 'Name' },
    getCanHide: () => true,
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

const SORT_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'brand', label: 'Brand' },
  { key: 'created_at', label: 'Added' },
]

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

  it('excludes columns where getCanHide() returns false from the column menu', () => {
    const cols = [
      makeCol({ id: 'select', columnDef: { header: 'Select' } as never, getCanHide: () => false }),
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

  it('does not show sort pills or add button when sortFields is not provided', () => {
    render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
      />
    )
    expect(screen.queryByLabelText('Add sort level')).not.toBeInTheDocument()
  })

  it('shows a sort pill for each active sort entry', () => {
    render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
        sortFields={SORT_FIELDS}
        sorting={[
          { id: 'name', desc: false },
          { id: 'brand', desc: true },
        ]}
        onSortAdd={jest.fn()}
        onSortRemove={jest.fn()}
        onSortToggleDir={jest.fn()}
      />
    )
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Brand')).toBeInTheDocument()
  })

  it('shows + button when fewer than 3 sort levels active', () => {
    render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
        sortFields={SORT_FIELDS}
        sorting={[{ id: 'name', desc: false }]}
        onSortAdd={jest.fn()}
        onSortRemove={jest.fn()}
        onSortToggleDir={jest.fn()}
      />
    )
    expect(screen.getByLabelText('Add sort level')).toBeInTheDocument()
  })

  it('hides + button when 3 sort levels are active', () => {
    render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
        sortFields={SORT_FIELDS}
        sorting={[
          { id: 'name', desc: false },
          { id: 'brand', desc: false },
          { id: 'created_at', desc: false },
        ]}
        onSortAdd={jest.fn()}
        onSortRemove={jest.fn()}
        onSortToggleDir={jest.fn()}
      />
    )
    expect(screen.queryByLabelText('Add sort level')).not.toBeInTheDocument()
  })

  it('opens add-field dropdown when + is clicked and shows only unused fields', () => {
    render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
        sortFields={SORT_FIELDS}
        sorting={[{ id: 'name', desc: false }]}
        onSortAdd={jest.fn()}
        onSortRemove={jest.fn()}
        onSortToggleDir={jest.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Add sort level'))
    expect(screen.getByText('Brand')).toBeInTheDocument()
    expect(screen.getByText('Added')).toBeInTheDocument()
    // 'Name' is already active — should not appear in the dropdown
    // (it appears as a pill label outside the dropdown, so query inside the dropdown)
    const dropdown = screen.getByText('Brand').closest('div')!.parentElement!
    expect(dropdown).not.toHaveTextContent('Name')
  })

  it('calls onSortAdd with selected field key when a dropdown item is clicked', () => {
    const onSortAdd = jest.fn()
    render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
        sortFields={SORT_FIELDS}
        sorting={[{ id: 'name', desc: false }]}
        onSortAdd={onSortAdd}
        onSortRemove={jest.fn()}
        onSortToggleDir={jest.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Add sort level'))
    fireEvent.click(screen.getByText('Brand'))
    expect(onSortAdd).toHaveBeenCalledWith('brand')
  })

  it('calls onSortRemove with correct index when × is clicked', () => {
    const onSortRemove = jest.fn()
    render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
        sortFields={SORT_FIELDS}
        sorting={[
          { id: 'name', desc: false },
          { id: 'brand', desc: false },
        ]}
        onSortAdd={jest.fn()}
        onSortRemove={onSortRemove}
        onSortToggleDir={jest.fn()}
      />
    )
    const removeButtons = screen.getAllByLabelText(/Remove .* sort/)
    fireEvent.click(removeButtons[1]) // remove Brand (index 1)
    expect(onSortRemove).toHaveBeenCalledWith(1)
  })

  it('calls onSortToggleDir with correct index when direction button is clicked', () => {
    const onSortToggleDir = jest.fn()
    render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
        sortFields={SORT_FIELDS}
        sorting={[
          { id: 'name', desc: false },
          { id: 'brand', desc: true },
        ]}
        onSortAdd={jest.fn()}
        onSortRemove={jest.fn()}
        onSortToggleDir={onSortToggleDir}
      />
    )
    const dirButtons = screen.getAllByLabelText(/Sort (ascending|descending)/)
    fireEvent.click(dirButtons[0]) // toggle Name (index 0)
    expect(onSortToggleDir).toHaveBeenCalledWith(0)
  })
})

describe('DataTableToolbar — Reset View', () => {
  function renderResetView(isDirty: boolean | undefined, onResetView?: () => void) {
    return render(
      <DataTableToolbar
        table={makeTable()}
        activeFilterCount={0}
        onClearFilters={jest.fn()}
        isDirty={isDirty}
        onResetView={onResetView}
      />
    )
  }

  it('does not show Reset View when isDirty is false', () => {
    renderResetView(false, jest.fn())
    expect(screen.queryByText('Reset View')).not.toBeInTheDocument()
  })

  it('does not show Reset View when onResetView is not provided', () => {
    renderResetView(true)
    expect(screen.queryByText('Reset View')).not.toBeInTheDocument()
  })

  it('shows Reset View when isDirty is true and onResetView is provided', () => {
    renderResetView(true, jest.fn())
    expect(screen.getByText('Reset View')).toBeInTheDocument()
  })

  it('calls onResetView when Reset View is clicked', () => {
    const onResetView = jest.fn()
    renderResetView(true, onResetView)
    fireEvent.click(screen.getByText('Reset View'))
    expect(onResetView).toHaveBeenCalledTimes(1)
  })
})
