import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { Table, Row, Column, Cell } from '@tanstack/react-table'
import { type VirtualItem } from '@tanstack/react-virtual'
import { DataTableBody } from '@/components/DataTableBody'

type TestRow = { id: string; name: string }

function makeCell(rowId: string, colId: string, value: string): Cell<TestRow, unknown> {
  return {
    id: `${rowId}_${colId}`,
    column: {
      columnDef: { cell: () => value },
      getSize: () => 150,
    } as unknown as Column<TestRow, unknown>,
    getContext: () => ({}) as never,
  } as unknown as Cell<TestRow, unknown>
}

function makeRow(id: string, name: string, isSelected = false): Row<TestRow> {
  return {
    id,
    original: { id, name },
    getVisibleCells: () => [makeCell(id, 'name', name)],
    getIsSelected: () => isSelected,
  } as unknown as Row<TestRow>
}

function makeTable(overrides: Partial<Table<TestRow>> = {}): Table<TestRow> {
  return {
    getAllLeafColumns: () => [{ id: 'name' }, { id: 'id' }],
    getVisibleLeafColumns: () => [{ id: 'name' }, { id: 'id' }],
    ...overrides,
  } as unknown as Table<TestRow>
}

function makeVirtualItem(index: number): VirtualItem {
  return { index, start: index * 44, end: (index + 1) * 44, size: 44, key: index, lane: 0 }
}

const emptyRows: Row<TestRow>[] = []

describe('DataTableBody', () => {
  it('renders skeleton rows when isLoading', () => {
    const { container } = render(
      <table>
        <DataTableBody
          table={makeTable()}
          rows={emptyRows}
          virtualItems={[]}
          paddingTop={0}
          paddingBottom={0}
          isLoading
        />
      </table>
    )
    // 10 skeleton rows × 2 columns = 20 skeleton cells
    expect(container.querySelectorAll('tbody tr')).toHaveLength(10)
  })

  it('renders "No records found" when rows is empty and not loading', () => {
    render(
      <table>
        <DataTableBody
          table={makeTable()}
          rows={emptyRows}
          virtualItems={[]}
          paddingTop={0}
          paddingBottom={0}
          isLoading={false}
        />
      </table>
    )
    expect(screen.getByText('No records found')).toBeInTheDocument()
  })

  it('renders virtual rows', () => {
    const rows = [makeRow('1', 'Alpha'), makeRow('2', 'Beta')]
    const virtualItems = [makeVirtualItem(0), makeVirtualItem(1)]
    render(
      <table>
        <DataTableBody
          table={makeTable()}
          rows={rows}
          virtualItems={virtualItems}
          paddingTop={0}
          paddingBottom={0}
          isLoading={false}
        />
      </table>
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('renders padding rows when paddingTop and paddingBottom are set', () => {
    const rows = [makeRow('1', 'Alpha')]
    const virtualItems = [makeVirtualItem(0)]
    const { container } = render(
      <table>
        <DataTableBody
          table={makeTable()}
          rows={rows}
          virtualItems={virtualItems}
          paddingTop={88}
          paddingBottom={44}
          isLoading={false}
        />
      </table>
    )
    const allRows = container.querySelectorAll('tbody tr')
    // 1 data row + 1 paddingTop row + 1 paddingBottom row = 3
    expect(allRows).toHaveLength(3)
  })

  it('renders "Loading more…" when isFetchingNextPage is true', () => {
    const rows = [makeRow('1', 'Alpha')]
    const virtualItems = [makeVirtualItem(0)]
    render(
      <table>
        <DataTableBody
          table={makeTable()}
          rows={rows}
          virtualItems={virtualItems}
          paddingTop={0}
          paddingBottom={0}
          isLoading={false}
          isFetchingNextPage
        />
      </table>
    )
    expect(screen.getByText('Loading more…')).toBeInTheDocument()
  })

  it('applies selected row highlight when row.getIsSelected() is true', () => {
    const rows = [makeRow('row-1', 'Alpha', true)]
    const virtualItems = [makeVirtualItem(0)]
    const { container } = render(
      <table>
        <DataTableBody
          table={makeTable()}
          rows={rows}
          virtualItems={virtualItems}
          paddingTop={0}
          paddingBottom={0}
          isLoading={false}
        />
      </table>
    )
    const tr = container.querySelector('tbody tr')!
    expect(tr.className).toContain('bg-primary/10')
  })
})
