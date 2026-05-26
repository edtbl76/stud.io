import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { WorkbenchBulkBar } from '@/components/tables/scanner/workbench/WorkbenchBulkBar'
import type { WorkbenchRow } from '@/lib/types'

function makeRow(overrides: Partial<WorkbenchRow> = {}): WorkbenchRow {
  return {
    result_id: 'r1', disk_name: 'X', disk_vendor: 'Y', disk_version: '1', disk_format: 'VST3',
    disk_path: '/p', display_name: 'X', display_vendor: 'Y',
    catalog_record_id: null, catalog_record_table: null, catalog_record_name: null,
    catalog_record_vendor: null, catalog_record_version: null,
    bucket: 'unlinked', confidence: null, confirmed_at: null, confirmed_by: null,
    ...overrides,
  }
}

const noop = jest.fn()
const DEFAULT_PROPS = {
  onResolveCollision: noop, onBulkResolve: noop,
  onBulkReject: noop, onBulkExclude: noop, onClearSelection: noop,
}

// Step 42
it('shows selected count', () => {
  const rows = [makeRow({ result_id: 'r1' }), makeRow({ result_id: 'r2' }), makeRow({ result_id: 'r3' })]
  render(<WorkbenchBulkBar selectedRows={rows} {...DEFAULT_PROPS} />)
  expect(screen.getByText(/3 selected/i)).toBeInTheDocument()
})

// Step 43: Resolve Collision
it('shows Resolve Collision only for exactly 2 rows both with catalog_record_id', () => {
  const rows = [
    makeRow({ result_id: 'r1', catalog_record_id: 'c1', bucket: 'needs_review' }),
    makeRow({ result_id: 'r2', catalog_record_id: 'c2', bucket: 'needs_review' }),
  ]
  render(<WorkbenchBulkBar selectedRows={rows} {...DEFAULT_PROPS} />)
  expect(screen.getByRole('button', { name: /resolve collision/i })).toBeInTheDocument()
})

it('does not show Resolve Collision when one row lacks catalog_record_id', () => {
  const rows = [
    makeRow({ result_id: 'r1', catalog_record_id: 'c1', bucket: 'needs_review' }),
    makeRow({ result_id: 'r2', catalog_record_id: null, bucket: 'unlinked' }),
  ]
  render(<WorkbenchBulkBar selectedRows={rows} {...DEFAULT_PROPS} />)
  expect(screen.queryByRole('button', { name: /resolve collision/i })).not.toBeInTheDocument()
})

it('does not show Resolve Collision when 3 rows are selected', () => {
  const rows = ['r1', 'r2', 'r3'].map((id) => makeRow({ result_id: id, catalog_record_id: 'c', bucket: 'needs_review' }))
  render(<WorkbenchBulkBar selectedRows={rows} {...DEFAULT_PROPS} />)
  expect(screen.queryByRole('button', { name: /resolve collision/i })).not.toBeInTheDocument()
})

// Step 44: Resolve (bulk resolve for needs_review)
it('shows Resolve button when at least one needs_review row is selected', () => {
  const rows = [makeRow({ result_id: 'r1', bucket: 'needs_review', catalog_record_id: 'c1' })]
  render(<WorkbenchBulkBar selectedRows={rows} {...DEFAULT_PROPS} />)
  expect(screen.getByRole('button', { name: /^resolve$/i })).toBeInTheDocument()
})

it('does not show Resolve button when no needs_review rows are selected', () => {
  const rows = [makeRow({ result_id: 'r1', bucket: 'unlinked' })]
  render(<WorkbenchBulkBar selectedRows={rows} {...DEFAULT_PROPS} />)
  expect(screen.queryByRole('button', { name: /^resolve$/i })).not.toBeInTheDocument()
})

// Step 45: Exclude always present; Reject when needs_review or known present
it('always shows Exclude button', () => {
  const rows = [makeRow({ result_id: 'r1', bucket: 'unlinked' })]
  render(<WorkbenchBulkBar selectedRows={rows} {...DEFAULT_PROPS} />)
  expect(screen.getByRole('button', { name: /exclude/i })).toBeInTheDocument()
})

it('shows Reject when needs_review row is in selection', () => {
  const rows = [makeRow({ result_id: 'r1', bucket: 'needs_review', catalog_record_id: 'c1' })]
  render(<WorkbenchBulkBar selectedRows={rows} {...DEFAULT_PROPS} />)
  expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
})

it('shows Reject when known row is in selection', () => {
  const rows = [makeRow({ result_id: 'r1', bucket: 'known', catalog_record_id: 'c1' })]
  render(<WorkbenchBulkBar selectedRows={rows} {...DEFAULT_PROPS} />)
  expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
})

it('does not show Reject for purely unlinked selection', () => {
  const rows = [makeRow({ result_id: 'r1', bucket: 'unlinked' })]
  render(<WorkbenchBulkBar selectedRows={rows} {...DEFAULT_PROPS} />)
  expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
})
