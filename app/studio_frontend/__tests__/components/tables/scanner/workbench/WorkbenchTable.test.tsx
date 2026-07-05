import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkbenchTable } from '@/components/tables/scanner/workbench/WorkbenchTable'
import type { WorkbenchRow } from '@/lib/types'

jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (i: number) => string | number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i, key: getItemKey(i), start: i * 60, size: 60, lane: 0, measureElement: jest.fn(),
      })),
    getTotalSize: () => count * 60,
  }),
}))

function makeRow(id: string, overrides: Partial<WorkbenchRow> = {}): WorkbenchRow {
  return {
    result_id: id, disk_name: `Plugin ${id}`, disk_vendor: 'Vendor', disk_version: '1.0', disk_format: 'VST3',
    disk_path: '/p', display_name: `Plugin ${id}`, display_vendor: 'Vendor',
    catalog_record_id: null, catalog_record_table: null, catalog_record_name: null,
    catalog_record_vendor: null, catalog_record_version: null,
    bucket: 'unlinked', confidence: null, confirmed_at: null, confirmed_by: null,
    ...overrides,
  }
}

const noop = jest.fn()
const DEFAULT_PROPS = {
  isLoading: false,
  selectedIds: new Set<string>(),
  rowSubStates: new Map(),
  onToggleSelect: noop,
  onShiftSelect: noop,
  onRowClick: noop,
}

// Step 52
it('renders a WorkbenchRow for each row', () => {
  const rows = ['r1', 'r2', 'r3'].map((id) => makeRow(id))
  render(<WorkbenchTable rows={rows} {...DEFAULT_PROPS} />)
  expect(screen.getByText('Plugin r1')).toBeInTheDocument()
  expect(screen.getByText('Plugin r2')).toBeInTheDocument()
  expect(screen.getByText('Plugin r3')).toBeInTheDocument()
})

// Step 53
it('shows 8 skeleton rows while isLoading, no row content', () => {
  render(<WorkbenchTable rows={[]} {...DEFAULT_PROPS} isLoading={true} />)
  const skeletons = document.querySelectorAll('[data-testid="workbench-skeleton-row"]')
  expect(skeletons).toHaveLength(8)
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
})

// Step 54
it('shows empty message when no rows and not loading', () => {
  render(<WorkbenchTable rows={[]} {...DEFAULT_PROPS} isLoading={false} />)
  expect(screen.getByText(/no results/i)).toBeInTheDocument()
})

// U-16 Step 10 — orphaned rows render inline in the main list (no separate section)
it('renders orphaned rows inline in the main list, with no separate orphaned section', () => {
  const row = makeRow('o1', { bucket: 'orphaned', catalog_record_id: 'o1', catalog_record_name: 'Orphan o1', display_name: 'Orphan o1' })
  render(<WorkbenchTable rows={[row]} {...DEFAULT_PROPS} />)
  expect(screen.getByText('Orphan o1')).toBeInTheDocument()
  expect(screen.queryByText(/orphaned catalog records/i)).not.toBeInTheDocument()
})

// Step 10 — Gap 1: subState threading
it('passes mismatch subState from rowSubStates to WorkbenchRow showing secondary pill', () => {
  const row = makeRow('r-m', { bucket: 'needs_review', catalog_record_id: 'c1' })
  const rowSubStates = new Map([['r-m', 'mismatch' as const]])
  render(<WorkbenchTable rows={[row]} {...DEFAULT_PROPS} rowSubStates={rowSubStates} />)
  expect(screen.getByTestId('bucket-tag-pill-sub')).toHaveTextContent('mismatch')
})

// Step 15 — Gap 2: select-all checkbox
it('select-all checkbox fires onSelectAll when clicked', () => {
  const onSelectAll = jest.fn()
  render(<WorkbenchTable rows={[makeRow('r1')]} {...DEFAULT_PROPS} onSelectAll={onSelectAll} />)
  fireEvent.click(screen.getByRole('checkbox', { name: /select all/i }))
  expect(onSelectAll).toHaveBeenCalledTimes(1)
})

// U-16 Step 9 — orphaned row's Find Link routes to onOrphanRowFindLink, not onFindLink
it('Find Link on an orphaned row fires onOrphanRowFindLink with the row, not onFindLink', () => {
  const onOrphanRowFindLink = jest.fn()
  const onFindLink = jest.fn()
  const row = makeRow('o1', { bucket: 'orphaned', catalog_record_id: 'o1', catalog_record_name: 'Orphan o1', display_name: 'Orphan o1' })
  render(<WorkbenchTable rows={[row]} {...DEFAULT_PROPS} onFindLink={onFindLink} onOrphanRowFindLink={onOrphanRowFindLink} />)
  fireEvent.click(screen.getByRole('button', { name: /find link/i }))
  expect(onOrphanRowFindLink).toHaveBeenCalledWith(row)
  expect(onFindLink).not.toHaveBeenCalled()
})

// Step 17 — Gap 2: row action callback threading
it('Reject button on a needs_review row fires onReject callback', () => {
  const onReject = jest.fn()
  const row = makeRow('r1', { bucket: 'needs_review', catalog_record_id: 'c1' })
  render(<WorkbenchTable rows={[row]} {...DEFAULT_PROPS} onReject={onReject} />)
  fireEvent.click(screen.getByRole('button', { name: /reject/i }))
  expect(onReject).toHaveBeenCalledWith(row)
})
