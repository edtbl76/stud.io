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
    },
  },
}))

const mockSetClientFilter = jest.fn()
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
  serverParams: { show_confirmed: true }, setServerBucket: jest.fn(),
  clientFilters: BLANK_FILTERS, setClientFilter: mockSetClientFilter,
  selectedIds: new Set<string>(), toggleSelect: mockToggleSelect,
  shiftSelect: mockShiftSelect, selectAll: jest.fn(), clearSelection: mockClearSelection,
  invalidate: mockInvalidate, rowSubStates: new Map(),
}

jest.mock('@/lib/useWorkbench', () => ({
  useWorkbench: jest.fn(() => BASE_HOOK),
}))

// Mock sub-components so tests focus on page wiring only
jest.mock('@/components/tables/scanner/workbench/WorkbenchTable', () => ({
  WorkbenchTable: () => <div data-testid="workbench-table" />,
}))
jest.mock('@/components/tables/scanner/modals/SingleResolutionModal', () => ({
  SingleResolutionModal: ({ onSaved, row }: { onSaved: () => void; row: WorkbenchRow }) => (
    <div data-testid="single-resolution-modal" data-row-id={row.result_id}>
      <button type="button" onClick={onSaved}>MockSave</button>
    </div>
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
it('wires WorkbenchFilterBar to setClientFilter', () => {
  render(<ScanWorkbenchPage />)
  fireEvent.change(screen.getByRole('combobox', { name: /bucket/i }), { target: { value: 'needs_review' } })
  expect(mockSetClientFilter).toHaveBeenCalledWith({ bucket: 'needs_review' })
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
