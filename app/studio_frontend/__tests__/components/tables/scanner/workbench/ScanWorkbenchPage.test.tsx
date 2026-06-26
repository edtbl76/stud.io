import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ScanWorkbenchPage } from '@/components/tables/scanner/workbench/ScanWorkbenchPage'
import type { WorkbenchRow } from '@/lib/types'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }))

jest.mock('@/lib/api', () => ({
  api: {
    scanner: {
      softReset: jest.fn(),
      hardReset: jest.fn(),
      exclude: jest.fn(),
      bulkUpdate: jest.fn(),
      rejectMatch: jest.fn(),
    },
  },
}))

const mockSetClientFilter = jest.fn()
const mockSetServerBucket = jest.fn()
const mockClearSelection = jest.fn()
const mockInvalidate = jest.fn()
const mockToggleSelect = jest.fn()
const mockShiftSelect = jest.fn()

const BLANK_FILTERS = { bucket: '' as const, needs_review_substate: '' as const, catalog_type: '', format: '' }

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

const BASE_HOOK = {
  rows: [], orphaned: [], isLoading: false, scanId: null,
  serverParams: { show_confirmed: true }, setServerBucket: mockSetServerBucket,
  clientFilters: BLANK_FILTERS, setClientFilter: mockSetClientFilter,
  selectedIds: new Set<string>(), toggleSelect: mockToggleSelect,
  shiftSelect: mockShiftSelect, selectAll: jest.fn(), clearSelection: mockClearSelection,
  invalidate: mockInvalidate, rowSubStates: new Map(),
}

jest.mock('@/lib/useWorkbench', () => ({
  useWorkbench: jest.fn(() => BASE_HOOK),
}))

// Mock sub-components so tests focus on page wiring only
import type { OrphanedRecord } from '@/lib/types'
type TableProps = {
  rows: WorkbenchRow[]; orphaned: OrphanedRecord[]; onReject?: (r: WorkbenchRow) => void;
  onFindLink?: (r: WorkbenchRow) => void; onCreateRecord?: (r: WorkbenchRow) => void;
  onExclude?: (r: WorkbenchRow) => void; onOrphanFindLink?: (o: OrphanedRecord) => void;
  onResolveCollision?: (r: WorkbenchRow) => void;
  onSelectAll?: () => void;
}
function MockTableActions({ rows, orphaned, onReject, onFindLink, onCreateRecord, onExclude, onOrphanFindLink, onResolveCollision, onSelectAll }: TableProps) {
  return (
    <div data-testid="workbench-table">
      <button type="button" onClick={() => onReject?.(rows[0])}>RowAction:Reject</button>
      <button type="button" onClick={() => onFindLink?.(rows[0])}>RowAction:FindLink</button>
      <button type="button" onClick={() => onCreateRecord?.(rows[0])}>RowAction:CreateRecord</button>
      <button type="button" onClick={() => onExclude?.(rows[0])}>RowAction:Exclude</button>
      <button type="button" onClick={() => onOrphanFindLink?.(orphaned[0])}>RowAction:OrphanFindLink</button>
      <button type="button" onClick={() => onResolveCollision?.(rows[0])}>RowAction:ResolveCollision</button>
      <button type="button" onClick={() => onSelectAll?.()}>RowAction:SelectAll</button>
    </div>
  )
}
jest.mock('@/components/tables/scanner/workbench/WorkbenchTable', () => ({
  WorkbenchTable: (props: TableProps) => <MockTableActions {...props} />,
}))
jest.mock('@/components/tables/scanner/modals/SingleResolutionModal', () => ({
  SingleResolutionModal: ({ onSaved, row }: { onSaved: () => void; row: WorkbenchRow }) => (
    <div data-testid="single-resolution-modal" data-row-id={row.result_id}>
      <button type="button" onClick={onSaved}>MockSave</button>
    </div>
  ),
}))
jest.mock('@/components/tables/scanner/modals/CollisionModal', () => ({
  CollisionModal: ({ row }: { row: WorkbenchRow }) => (
    <div data-testid="collision-modal" data-row-id={row.result_id} />
  ),
}))
jest.mock('@/components/tables/scanner/modals/FindLinkModal', () => ({
  FindLinkModal: ({ mode, sourceId }: { mode: string; sourceId: string }) => (
    <div data-testid="find-link-modal" data-mode={mode} data-source-id={sourceId} />
  ),
}))
jest.mock('@/components/tables/scanner/modals/CreateRecordModal', () => ({
  CreateRecordModal: ({ row }: { row: WorkbenchRow }) => (
    <div data-testid="create-record-modal" data-row-id={row.result_id} />
  ),
}))

import { useWorkbench } from '@/lib/useWorkbench'
import { api } from '@/lib/api'
import { toast } from 'sonner'
const mockUseWorkbench = useWorkbench as jest.Mock
const mockApi = api as jest.Mocked<typeof api>
const mockToast = toast as jest.Mocked<typeof toast>

afterEach(() => jest.clearAllMocks())

// Step 80
it('renders Soft Reset and Hard Reset buttons', () => {
  render(<ScanWorkbenchPage />)
  expect(screen.getByRole('button', { name: /soft reset/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /hard reset/i })).toBeInTheDocument()
})

// Step 81
it('calls api.scanner.softReset and fires toast on Soft Reset click', async () => {
  ;(mockApi.scanner.softReset as jest.Mock).mockResolvedValue({ deleted_results: 0 })
  render(<ScanWorkbenchPage />)
  fireEvent.click(screen.getByRole('button', { name: /soft reset/i }))
  await waitFor(() => expect(mockApi.scanner.softReset).toHaveBeenCalled())
  expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/soft reset/i))
})

it('shows error toast and skips invalidate when softReset fails', async () => {
  ;(mockApi.scanner.softReset as jest.Mock).mockRejectedValue(new Error('Network error'))
  render(<ScanWorkbenchPage />)
  fireEvent.click(screen.getByRole('button', { name: /soft reset/i }))
  await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Network error'))
  expect(mockInvalidate).not.toHaveBeenCalled()
})

// Step 82
it('opens Hard Reset dialog with disabled Confirm until correct text entered', () => {
  render(<ScanWorkbenchPage />)
  fireEvent.click(screen.getByRole('button', { name: /hard reset/i }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'RESET ALL SCANNER DATA' } })
  expect(screen.getByRole('button', { name: /confirm/i })).not.toBeDisabled()
})

it('calls api.scanner.hardReset, fires success toast, and closes dialog on Confirm', async () => {
  ;(mockApi.scanner.hardReset as jest.Mock).mockResolvedValue({})
  render(<ScanWorkbenchPage />)
  fireEvent.click(screen.getByRole('button', { name: /hard reset/i }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'RESET ALL SCANNER DATA' } })
  fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
  await waitFor(() => expect(mockApi.scanner.hardReset).toHaveBeenCalledWith('RESET ALL SCANNER DATA'))
  expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/hard reset/i))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('disables Confirm button while hard reset is in-flight', async () => {
  ;(mockApi.scanner.hardReset as jest.Mock).mockImplementation(() => new Promise(() => {}))
  render(<ScanWorkbenchPage />)
  fireEvent.click(screen.getByRole('button', { name: /hard reset/i }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'RESET ALL SCANNER DATA' } })
  fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
  await waitFor(() => expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled())
})

it('shows error toast and keeps dialog open when hardReset fails', async () => {
  ;(mockApi.scanner.hardReset as jest.Mock).mockRejectedValue(new Error('Server error'))
  render(<ScanWorkbenchPage />)
  fireEvent.click(screen.getByRole('button', { name: /hard reset/i }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'RESET ALL SCANNER DATA' } })
  fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
  await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Server error'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(mockInvalidate).not.toHaveBeenCalled()
})

// Step 83
it('wires WorkbenchFilterBar bucket change to both setClientFilter and setServerBucket', () => {
  render(<ScanWorkbenchPage />)
  fireEvent.change(screen.getByRole('combobox', { name: /bucket/i }), { target: { value: 'needs_review' } })
  expect(mockSetClientFilter).toHaveBeenCalledWith({ bucket: 'needs_review' })
  expect(mockSetServerBucket).toHaveBeenCalledWith('needs_review')
})

it('clearing bucket filter resets needs_review_substate and calls setServerBucket with undefined', () => {
  render(<ScanWorkbenchPage />)
  fireEvent.change(screen.getByRole('combobox', { name: /bucket/i }), { target: { value: '' } })
  expect(mockSetClientFilter).toHaveBeenCalledWith({ bucket: '', needs_review_substate: '' })
  expect(mockSetServerBucket).toHaveBeenCalledWith(undefined)
})

it('changing bucket to a non-needs_review value clears needs_review_substate', () => {
  render(<ScanWorkbenchPage />)
  fireEvent.change(screen.getByRole('combobox', { name: /bucket/i }), { target: { value: 'known' } })
  expect(mockSetClientFilter).toHaveBeenCalledWith({ bucket: 'known', needs_review_substate: '' })
  expect(mockSetServerBucket).toHaveBeenCalledWith('known')
})

// Step 84
it('shows WorkbenchBulkBar when selection is non-empty', () => {
  const rows = [
    makeRow('r1', { bucket: 'needs_review', catalog_record_id: 'c1', catalog_record_table: 'instruments', catalog_record_name: 'N', catalog_record_vendor: 'V', catalog_record_version: '1.0' }),
  ]
  mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, rows, selectedIds: new Set(['r1']) })
  render(<ScanWorkbenchPage />)
  expect(screen.getByText(/1 selected/i)).toBeInTheDocument()
})

it('opens SingleResolutionModal for first needs_review row on Resolve click', () => {
  const r1 = makeRow('r1', { bucket: 'needs_review', catalog_record_id: 'c1', catalog_record_table: 'instruments', catalog_record_name: 'N', catalog_record_vendor: 'V', catalog_record_version: '1.0' })
  const r2 = makeRow('r2', { bucket: 'needs_review', catalog_record_id: 'c2', catalog_record_table: 'instruments', catalog_record_name: 'N2', catalog_record_vendor: 'V2', catalog_record_version: '1.0' })
  mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, rows: [r1, r2], selectedIds: new Set(['r1', 'r2']) })
  render(<ScanWorkbenchPage />)
  fireEvent.click(screen.getByRole('button', { name: /^resolve$/i }))
  expect(screen.getByTestId('single-resolution-modal')).toHaveAttribute('data-row-id', 'r1')
})

it('advances to second row after first modal saved (BLM-14)', async () => {
  const r1 = makeRow('r1', { bucket: 'needs_review', catalog_record_id: 'c1', catalog_record_table: 'instruments', catalog_record_name: 'N', catalog_record_vendor: 'V', catalog_record_version: '1.0' })
  const r2 = makeRow('r2', { bucket: 'needs_review', catalog_record_id: 'c2', catalog_record_table: 'instruments', catalog_record_name: 'N2', catalog_record_vendor: 'V2', catalog_record_version: '1.0' })
  mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, rows: [r1, r2], selectedIds: new Set(['r1', 'r2']) })
  render(<ScanWorkbenchPage />)
  fireEvent.click(screen.getByRole('button', { name: /^resolve$/i }))
  expect(screen.getByTestId('single-resolution-modal')).toHaveAttribute('data-row-id', 'r1')
  fireEvent.click(screen.getByRole('button', { name: 'MockSave' }))
  await waitFor(() =>
    expect(screen.getByTestId('single-resolution-modal')).toHaveAttribute('data-row-id', 'r2')
  )
})

// Step 21 — handleBulkExclude happy path
describe('handleBulkExclude', () => {
  it('calls api.scanner.exclude for each selected row', async () => {
    const r1 = makeRow('r1', { disk_vendor: 'MNTRA', disk_name: 'Surge XT', disk_format: 'VST3' })
    const r2 = makeRow('r2', { disk_vendor: 'Arturia', disk_name: 'Pigments', disk_format: 'AU' })
    ;(mockApi.scanner.exclude as jest.Mock).mockResolvedValue(undefined)
    mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, rows: [r1, r2], selectedIds: new Set(['r1', 'r2']) })
    render(<ScanWorkbenchPage />)
    fireEvent.click(screen.getAllByRole('button', { name: /exclude/i })[0])
    await waitFor(() => {
      expect(mockApi.scanner.exclude).toHaveBeenCalledWith('MNTRA', 'Surge XT', 'VST3')
      expect(mockApi.scanner.exclude).toHaveBeenCalledWith('Arturia', 'Pigments', 'AU')
    })
  })

  it('clears selection and invalidates after successful bulk exclude', async () => {
    const r1 = makeRow('r1', { disk_vendor: 'MNTRA', disk_name: 'Surge XT', disk_format: 'VST3' })
    ;(mockApi.scanner.exclude as jest.Mock).mockResolvedValue(undefined)
    mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, rows: [r1], selectedIds: new Set(['r1']) })
    render(<ScanWorkbenchPage />)
    fireEvent.click(screen.getAllByRole('button', { name: /exclude/i })[0])
    await waitFor(() => expect(mockClearSelection).toHaveBeenCalled())
    expect(mockInvalidate).toHaveBeenCalled()
  })
})

// Step 7 — Gap 1: handleBulkUpdate
describe('handleBulkUpdate', () => {
  const r1 = makeRow('r1', { bucket: 'needs_review', catalog_record_id: 'c1' })
  const rowSubStates = new Map([['r1', 'mismatch' as const]])

  beforeEach(() => {
    mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, rows: [r1], selectedIds: new Set(['r1']), rowSubStates })
  })

  it('calls bulkUpdate with mismatch ids, toasts success, clears selection and invalidates', async () => {
    ;(mockApi.scanner.bulkUpdate as jest.Mock).mockResolvedValue({ updated: 1 })
    render(<ScanWorkbenchPage />)
    fireEvent.click(screen.getByRole('button', { name: /bulk update/i }))
    await waitFor(() => expect(mockApi.scanner.bulkUpdate).toHaveBeenCalledWith(['r1']))
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/1 record/i))
    expect(mockClearSelection).toHaveBeenCalled()
    expect(mockInvalidate).toHaveBeenCalled()
  })

  it('shows error toast on failure', async () => {
    ;(mockApi.scanner.bulkUpdate as jest.Mock).mockRejectedValue(new Error('update failed'))
    render(<ScanWorkbenchPage />)
    fireEvent.click(screen.getByRole('button', { name: /bulk update/i }))
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled())
  })
})

// Step 22 — handleBulkExclude error path
describe('handleBulkExclude error path', () => {
  it('shows error toast and still clears selection and invalidates when exclude rejects', async () => {
    const r1 = makeRow('r1', { disk_vendor: 'MNTRA', disk_name: 'Surge XT', disk_format: 'VST3' })
    ;(mockApi.scanner.exclude as jest.Mock).mockRejectedValue(new Error('exclude failed'))
    mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, rows: [r1], selectedIds: new Set(['r1']) })
    render(<ScanWorkbenchPage />)
    fireEvent.click(screen.getAllByRole('button', { name: /exclude/i })[0])
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled())
    expect(mockClearSelection).toHaveBeenCalled()
    expect(mockInvalidate).toHaveBeenCalled()
  })
})

// Steps 18-24 — Gap 2: row-level handlers and stubs

// Step 18 — handleReject (single row)
describe('handleReject', () => {
  it('calls api.scanner.rejectMatch and invalidates', async () => {
    const r1 = makeRow('r1', { bucket: 'needs_review', catalog_record_id: 'c1' })
    ;(mockApi.scanner.rejectMatch as jest.Mock).mockResolvedValue(undefined)
    mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, rows: [r1] })
    render(<ScanWorkbenchPage />)
    fireEvent.click(screen.getByRole('button', { name: 'RowAction:Reject' }))
    await waitFor(() => expect(mockApi.scanner.rejectMatch).toHaveBeenCalledWith('r1'))
    expect(mockInvalidate).toHaveBeenCalled()
  })
})

// Step 19 — handleFindLink and handleOrphanFindLink
describe('handleFindLink', () => {
  it('opens FindLinkModal in unlinked-to-orphaned mode for unlinked row', () => {
    const r1 = makeRow('r1', { bucket: 'unlinked' })
    mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, rows: [r1] })
    render(<ScanWorkbenchPage />)
    fireEvent.click(screen.getByRole('button', { name: 'RowAction:FindLink' }))
    expect(screen.getByTestId('find-link-modal')).toHaveAttribute('data-mode', 'unlinked-to-orphaned')
    expect(screen.getByTestId('find-link-modal')).toHaveAttribute('data-source-id', 'r1')
  })

  it('opens FindLinkModal in orphaned-to-unlinked mode for orphaned record', () => {
    const orphan = { catalog_record_id: 'cat-1', catalog_record_table: 'instruments', name: 'X', vendor: null, version: null, disk_paths: [] }
    mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, orphaned: [orphan] })
    render(<ScanWorkbenchPage />)
    fireEvent.click(screen.getByRole('button', { name: 'RowAction:OrphanFindLink' }))
    expect(screen.getByTestId('find-link-modal')).toHaveAttribute('data-mode', 'orphaned-to-unlinked')
    expect(screen.getByTestId('find-link-modal')).toHaveAttribute('data-source-id', 'cat-1')
  })
})

// Step 20 — handleCreateRecord
describe('handleCreateRecord', () => {
  it('opens CreateRecordModal with the row', () => {
    const r1 = makeRow('r1', { bucket: 'unlinked' })
    mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, rows: [r1] })
    render(<ScanWorkbenchPage />)
    fireEvent.click(screen.getByRole('button', { name: 'RowAction:CreateRecord' }))
    expect(screen.getByTestId('create-record-modal')).toHaveAttribute('data-row-id', 'r1')
  })
})

// Step 21 — handleExclude (single row)
describe('handleExclude (single row)', () => {
  it('calls api.scanner.exclude and invalidates', async () => {
    const r1 = makeRow('r1', { bucket: 'unlinked', disk_vendor: 'V', disk_name: 'P', disk_format: 'VST3' })
    ;(mockApi.scanner.exclude as jest.Mock).mockResolvedValue(undefined)
    mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, rows: [r1] })
    render(<ScanWorkbenchPage />)
    fireEvent.click(screen.getByRole('button', { name: 'RowAction:Exclude' }))
    await waitFor(() => expect(mockApi.scanner.exclude).toHaveBeenCalledWith('V', 'P', 'VST3'))
    expect(mockInvalidate).toHaveBeenCalled()
  })
})

// U-18 — handleResolveCollision opens the record-centric modal for the clicked row
describe('handleResolveCollision', () => {
  it('opens CollisionModal for the collision row', () => {
    const r1 = makeRow('r1', { bucket: 'collision', catalog_record_id: 'c1' })
    mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, rows: [r1] })
    render(<ScanWorkbenchPage />)
    fireEvent.click(screen.getByRole('button', { name: 'RowAction:ResolveCollision' }))
    expect(screen.getByTestId('collision-modal')).toHaveAttribute('data-row-id', 'r1')
  })
})

// Step 23 — handleBulkReject (replace stub)
describe('handleBulkReject', () => {
  it('calls rejectMatch serially for each needs_review and known row', async () => {
    const r1 = makeRow('r1', { bucket: 'needs_review', catalog_record_id: 'c1' })
    const r2 = makeRow('r2', { bucket: 'known', catalog_record_id: 'c2' })
    ;(mockApi.scanner.rejectMatch as jest.Mock).mockResolvedValue(undefined)
    mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, rows: [r1, r2], selectedIds: new Set(['r1', 'r2']) })
    render(<ScanWorkbenchPage />)
    fireEvent.click(screen.getAllByRole('button', { name: /reject/i })[0])
    await waitFor(() => expect(mockApi.scanner.rejectMatch).toHaveBeenCalledTimes(2))
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/2/))
  })
})

// Step 24 — selectAll wired
describe('selectAll wiring', () => {
  it('MockSelectAll button triggers selectAll from useWorkbench', () => {
    const mockSelectAll = jest.fn()
    mockUseWorkbench.mockReturnValue({ ...BASE_HOOK, selectAll: mockSelectAll })
    render(<ScanWorkbenchPage />)
    fireEvent.click(screen.getByRole('button', { name: 'RowAction:SelectAll' }))
    expect(mockSelectAll).toHaveBeenCalledTimes(1)
  })
})
