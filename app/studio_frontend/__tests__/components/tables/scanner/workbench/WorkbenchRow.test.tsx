import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkbenchRow } from '@/components/tables/scanner/workbench/WorkbenchRow'
import type { WorkbenchRow as WorkbenchRowType } from '@/lib/types'

function makeRow(overrides: Partial<WorkbenchRowType> = {}): WorkbenchRowType {
  return {
    result_id: 'r1', disk_name: 'Serum', disk_vendor: 'Xfer', disk_version: '1.3', disk_format: 'VST3',
    disk_path: '/p', display_name: 'Serum', display_vendor: 'Xfer Records',
    catalog_record_id: null, catalog_record_table: null, catalog_record_name: null,
    catalog_record_vendor: null, catalog_record_version: null,
    bucket: 'unlinked', confidence: null, confirmed_at: null, confirmed_by: null,
    ...overrides,
  }
}

const noop = jest.fn()
const DEFAULT_PROPS = {
  isSelected: false,
  onToggleSelect: noop,
  onShiftSelect: noop,
  onRowClick: noop,
}

// Step 46
it('renders display_name, display_vendor, disk_version, disk_format', () => {
  render(<WorkbenchRow row={makeRow({ bucket: 'needs_review', catalog_record_id: 'c1' })} {...DEFAULT_PROPS} />)
  expect(screen.getByText('Serum')).toBeInTheDocument()
  expect(screen.getByText('Xfer Records')).toBeInTheDocument()
  expect(screen.getByText('1.3')).toBeInTheDocument()
  expect(screen.getByText('VST3')).toBeInTheDocument()
})

// Step 47
it('sets title to disk_name on name cell when display_name differs from disk_name', () => {
  const row = makeRow({ disk_name: 'Serum VST3', display_name: 'Serum' })
  render(<WorkbenchRow row={row} {...DEFAULT_PROPS} />)
  expect(screen.getByTitle('Serum VST3')).toBeInTheDocument()
})

// Step 48
it('has no title attribute on name cell when display_name equals disk_name', () => {
  const row = makeRow({ disk_name: 'Serum', display_name: 'Serum' })
  render(<WorkbenchRow row={row} {...DEFAULT_PROPS} />)
  expect(screen.queryByTitle('Serum')).not.toBeInTheDocument()
})

// Step 49
it('shows Reject only for needs_review row', () => {
  render(<WorkbenchRow row={makeRow({ bucket: 'needs_review', catalog_record_id: 'c1' })} {...DEFAULT_PROPS} />)
  expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /find link/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /create record/i })).not.toBeInTheDocument()
})

it('shows Find Link, Create Record, Exclude for unlinked row', () => {
  render(<WorkbenchRow row={makeRow({ bucket: 'unlinked' })} {...DEFAULT_PROPS} />)
  expect(screen.getByRole('button', { name: /find link/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /create record/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /exclude/i })).toBeInTheDocument()
})

it('shows Find Link only for orphaned row', () => {
  render(<WorkbenchRow row={makeRow({ bucket: 'orphaned' })} {...DEFAULT_PROPS} />)
  expect(screen.getByRole('button', { name: /find link/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /create record/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
})

it('shows Reject only for known row', () => {
  render(<WorkbenchRow row={makeRow({ bucket: 'known', catalog_record_id: 'c1' })} {...DEFAULT_PROPS} />)
  expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /find link/i })).not.toBeInTheDocument()
})

// Step 11 — Gap 2: Reject fires onReject
it('Reject button on needs_review row fires onReject', () => {
  const onReject = jest.fn()
  render(<WorkbenchRow row={makeRow({ bucket: 'needs_review', catalog_record_id: 'c1' })} {...DEFAULT_PROPS} onReject={onReject} />)
  fireEvent.click(screen.getByRole('button', { name: /reject/i }))
  expect(onReject).toHaveBeenCalledTimes(1)
})

it('Reject button on known row fires onReject', () => {
  const onReject = jest.fn()
  render(<WorkbenchRow row={makeRow({ bucket: 'known', catalog_record_id: 'c1' })} {...DEFAULT_PROPS} onReject={onReject} />)
  fireEvent.click(screen.getByRole('button', { name: /reject/i }))
  expect(onReject).toHaveBeenCalledTimes(1)
})

// Step 12 — Find Link fires onFindLink for unlinked
it('Find Link button on unlinked row fires onFindLink', () => {
  const onFindLink = jest.fn()
  render(<WorkbenchRow row={makeRow({ bucket: 'unlinked' })} {...DEFAULT_PROPS} onFindLink={onFindLink} />)
  fireEvent.click(screen.getByRole('button', { name: /find link/i }))
  expect(onFindLink).toHaveBeenCalledTimes(1)
})

// Step 13 — Create Record fires onCreateRecord for unlinked
it('Create Record button on unlinked row fires onCreateRecord', () => {
  const onCreateRecord = jest.fn()
  render(<WorkbenchRow row={makeRow({ bucket: 'unlinked' })} {...DEFAULT_PROPS} onCreateRecord={onCreateRecord} />)
  fireEvent.click(screen.getByRole('button', { name: /create record/i }))
  expect(onCreateRecord).toHaveBeenCalledTimes(1)
})

// Step 14 — Exclude fires onExclude for unlinked
it('Exclude button on unlinked row fires onExclude', () => {
  const onExclude = jest.fn()
  render(<WorkbenchRow row={makeRow({ bucket: 'unlinked' })} {...DEFAULT_PROPS} onExclude={onExclude} />)
  fireEvent.click(screen.getByRole('button', { name: /exclude/i }))
  expect(onExclude).toHaveBeenCalledTimes(1)
})

// U-18 — collision row: Collision tag + Resolve trigger
it('shows a Collision tag and Resolve button for a collision row, firing onResolveCollision', () => {
  const onResolveCollision = jest.fn()
  render(<WorkbenchRow row={makeRow({ bucket: 'collision', catalog_record_id: 'c1' })} {...DEFAULT_PROPS} onResolveCollision={onResolveCollision} />)
  expect(screen.getByText('Collision')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /resolve/i }))
  expect(onResolveCollision).toHaveBeenCalledTimes(1)
})

it('does not show Resolve for non-collision rows', () => {
  render(<WorkbenchRow row={makeRow({ bucket: 'unlinked' })} {...DEFAULT_PROPS} />)
  expect(screen.queryByRole('button', { name: /resolve/i })).not.toBeInTheDocument()
})

// Step 50
it('checkbox click calls onToggleSelect', () => {
  const onToggle = jest.fn()
  render(<WorkbenchRow row={makeRow()} isSelected={false} onToggleSelect={onToggle} onShiftSelect={noop} onRowClick={noop} />)
  fireEvent.click(screen.getByRole('checkbox'))
  expect(onToggle).toHaveBeenCalledWith('r1')
})

it('row body click calls onRowClick, not onToggleSelect', () => {
  const onToggle = jest.fn()
  const onRowClick = jest.fn()
  render(<WorkbenchRow row={makeRow()} isSelected={false} onToggleSelect={onToggle} onShiftSelect={noop} onRowClick={onRowClick} />)
  fireEvent.click(screen.getByText('Serum'))
  expect(onRowClick).toHaveBeenCalled()
  expect(onToggle).not.toHaveBeenCalled()
})

// Step 9 — Gap 1: subState prop renders BucketTag secondary pill
it('renders BucketTag secondary pill when subState prop is provided on needs_review row', () => {
  render(<WorkbenchRow row={makeRow({ bucket: 'needs_review', catalog_record_id: 'c1' })} subState="mismatch" {...DEFAULT_PROPS} />)
  expect(screen.getByTestId('bucket-tag-pill-sub')).toHaveTextContent('mismatch')
})

it('does not render secondary pill when subState is undefined', () => {
  render(<WorkbenchRow row={makeRow({ bucket: 'needs_review', catalog_record_id: 'c1' })} {...DEFAULT_PROPS} />)
  expect(screen.queryByTestId('bucket-tag-pill-sub')).not.toBeInTheDocument()
})

it('does not render secondary pill for non-needs_review row even with subState', () => {
  render(<WorkbenchRow row={makeRow({ bucket: 'unlinked' })} subState="mismatch" {...DEFAULT_PROPS} />)
  expect(screen.queryByTestId('bucket-tag-pill-sub')).not.toBeInTheDocument()
})

// Step 51
it('shift-click checkbox calls onShiftSelect', () => {
  const onShift = jest.fn()
  render(<WorkbenchRow row={makeRow()} isSelected={false} onToggleSelect={noop} onShiftSelect={onShift} onRowClick={noop} />)
  fireEvent.click(screen.getByRole('checkbox'), { shiftKey: true })
  expect(onShift).toHaveBeenCalledWith('r1')
})
