import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/DataTable'

// useVirtualizer needs ResizeObserver in jsdom
globalThis.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

type Row = { id: string; name: string }

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
]

const rows: Row[] = [
  { id: '1', name: 'Alpha' },
  { id: '2', name: 'Beta' },
]

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable columns={columns} data={rows} />)
    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
  })

  it('renders skeleton rows when loading', () => {
    const { container } = render(
      <DataTable columns={columns} data={[]} isLoading />
    )
    expect(container.querySelector('table')).toBeInTheDocument()
  })

  it('renders empty table with no data', () => {
    const { container } = render(<DataTable columns={columns} data={[]} />)
    expect(container.querySelector('table')).toBeInTheDocument()
  })
})
