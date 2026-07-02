import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SingleResolutionModal } from '@/components/tables/scanner/modals/SingleResolutionModal'
import type { WorkbenchRow, RuleCreationResult } from '@/lib/types'

jest.mock('@/lib/api', () => ({
  api: {
    update: jest.fn(),
    scanner: {
      createVendorRule: jest.fn(),
      createNameRule: jest.fn(),
      createAlias: jest.fn(),
    },
  },
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

import { api } from '@/lib/api'
const mockApi = api as jest.Mocked<typeof api>

function makeRow(overrides: Partial<WorkbenchRow> = {}): WorkbenchRow {
  return {
    result_id: 'r1', disk_name: 'Surge XT', disk_vendor: 'Vembertech', disk_version: '1.3', disk_format: 'VST3',
    disk_path: '/p', display_name: 'Surge XT', display_vendor: 'Vembertech',
    catalog_record_id: 'c1', catalog_record_table: 'instruments',
    catalog_record_name: 'Surge', catalog_record_vendor: 'Surge Synth Team', catalog_record_version: '1.3',
    bucket: 'needs_review', confidence: null, confirmed_at: null, confirmed_by: null,
    ...overrides,
  }
}

const noop = jest.fn()

function mockSuccess() {
  ;(mockApi.update as jest.Mock).mockResolvedValue({})
  ;(mockApi.scanner.createVendorRule as jest.Mock).mockResolvedValue({
    rule: { rule_id: 'rv1', disk_vendor: 'Vembertech', catalog_vendor: 'Surge Synth Team', enabled: true, created_by: 'test', created_at: '2026-01-01T00:00:00Z', affected_count: 2, clean_count: 1, needs_review_count: 1 },
    affected_count: 2, clean_count: 1, needs_review_count: 1,
  } satisfies RuleCreationResult)
  ;(mockApi.scanner.createNameRule as jest.Mock).mockResolvedValue({
    rule: { rule_id: 'rn1', disk_name: 'Surge XT', catalog_name: 'Surge', disk_vendor: 'Vembertech', enabled: true, created_by: 'test', created_at: '2026-01-01T00:00:00Z', affected_count: 1, clean_count: 1, needs_review_count: 0 },
    affected_count: 1, clean_count: 1, needs_review_count: 0,
  } satisfies RuleCreationResult)
}

afterEach(() => jest.resetAllMocks())

function renderAndClickSave(radioIndices: number[]) {
  mockSuccess()
  render(<SingleResolutionModal row={makeRow()} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  const radios = screen.getAllByRole('radio')
  for (const idx of radioIndices) fireEvent.click(radios[idx])
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
}

// Step 56
it('renders both disk and catalog values with radios for differing fields', () => {
  render(<SingleResolutionModal row={makeRow()} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  // name differs: disk="Surge XT", catalog="Surge"
  expect(screen.getByText('Surge XT')).toBeInTheDocument()
  expect(screen.getByText('Surge')).toBeInTheDocument()
  // vendor differs: disk="Vembertech", catalog="Surge Synth Team"
  expect(screen.getByText('Vembertech')).toBeInTheDocument()
  expect(screen.getByText('Surge Synth Team')).toBeInTheDocument()
  // radio buttons present for differing fields
  expect(screen.getAllByRole('radio').length).toBeGreaterThan(0)
})

// Step 57
it('shows no radio for matching fields', () => {
  // version matches (1.3 === 1.3), only name and vendor differ
  const row = makeRow()
  render(<SingleResolutionModal row={row} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  // version field (1.3) should render as plain text without radio
  const radios = screen.getAllByRole('radio')
  // 2 differing fields × 2 radios each = 4 radios (name and vendor)
  expect(radios).toHaveLength(4)
})

// Step 58
it('Save is disabled when no radio selected', () => {
  render(<SingleResolutionModal row={makeRow()} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
})

it('Save is enabled after all differing fields are resolved', () => {
  render(<SingleResolutionModal row={makeRow()} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  const radios = screen.getAllByRole('radio')
  // select disk for first two differing fields (radios alternate disk/catalog per field)
  fireEvent.click(radios[0]) // name → disk
  fireEvent.click(radios[2]) // vendor → disk
  expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
})

// Step 59
it('calls api.update with chosen field values on Save', async () => {
  renderAndClickSave([0, 3]) // name → disk, vendor → catalog
  await waitFor(() => expect(mockApi.update).toHaveBeenCalledWith(
    '/catalog/instruments', 'c1',
    expect.objectContaining({ name: 'Surge XT', vendor: 'Surge Synth Team' })
  ))
})

// Step 60
it('creates vendor rule when catalog vendor chosen', async () => {
  renderAndClickSave([0, 3]) // name → disk, vendor → catalog
  await waitFor(() => expect(mockApi.scanner.createVendorRule).toHaveBeenCalledWith({
    disk_vendor: 'Vembertech', catalog_vendor: 'Surge Synth Team',
  }))
  expect(mockApi.scanner.createNameRule).not.toHaveBeenCalled()
})

it('does not create rule when disk value chosen', async () => {
  renderAndClickSave([0, 2]) // name → disk, vendor → disk
  await waitFor(() => expect(mockApi.update).toHaveBeenCalled())
  expect(mockApi.scanner.createVendorRule).not.toHaveBeenCalled()
  expect(mockApi.scanner.createNameRule).not.toHaveBeenCalled()
})

it('skips vendor rule creation when catalog vendor value is null', async () => {
  ;(mockApi.update as jest.Mock).mockResolvedValue({})
  render(<SingleResolutionModal
    row={makeRow({ catalog_record_name: 'Surge XT', catalog_record_vendor: null })}
    onClose={noop} onSaved={noop} onFireRuleToasts={noop}
  />)
  const radios = screen.getAllByRole('radio')
  fireEvent.click(radios[1]) // vendor → catalog (null)
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(mockApi.update).toHaveBeenCalled())
  expect(mockApi.scanner.createVendorRule).not.toHaveBeenCalled()
})

// Step 61
it('shows inline error and keeps modal open when PATCH fails', async () => {
  ;(mockApi.update as jest.Mock).mockRejectedValue(new Error('Server error'))
  render(<SingleResolutionModal row={makeRow()} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  const radios = screen.getAllByRole('radio')
  fireEvent.click(radios[0])
  fireEvent.click(radios[2])
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
})

// Step 62
it('calls onSaved and onFireRuleToasts on success', async () => {
  mockSuccess()
  const onSaved = jest.fn()
  const onFireRuleToasts = jest.fn()
  render(<SingleResolutionModal row={makeRow()} onClose={noop} onSaved={onSaved} onFireRuleToasts={onFireRuleToasts} />)
  const radios = screen.getAllByRole('radio')
  fireEvent.click(radios[0]) // disk name
  fireEvent.click(radios[3]) // catalog vendor → triggers vendor rule
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(onFireRuleToasts).toHaveBeenCalled()
})

// Step 63
it('calls onClose on Cancel without calling onSaved', () => {
  const onClose = jest.fn()
  const onSaved = jest.fn()
  render(<SingleResolutionModal row={makeRow()} onClose={onClose} onSaved={onSaved} onFireRuleToasts={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
  expect(onClose).toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})

// U-17: shared Dialog migration + close policy (BR-U17-02)
it('renders via the shared Dialog with a built-in Close (X) that calls onClose', () => {
  const onClose = jest.fn()
  render(<SingleResolutionModal row={makeRow()} onClose={onClose} onSaved={noop} onFireRuleToasts={noop} />)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
  expect(onClose).toHaveBeenCalled()
})

it('closes on Escape', () => {
  const onClose = jest.fn()
  render(<SingleResolutionModal row={makeRow()} onClose={onClose} onSaved={noop} onFireRuleToasts={noop} />)
  fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})

// U-19: Set Name Alias
function getToast() {
  return (jest.requireMock('sonner') as { toast: { success: jest.Mock; error: jest.Mock } }).toast
}

// Step 9 — button calls createAlias with the row's raw disk name + matched record
it('Set Name Alias calls createAlias with disk_name and the matched record', async () => {
  ;(mockApi.scanner.createAlias as jest.Mock).mockResolvedValue(undefined)
  render(<SingleResolutionModal row={makeRow()} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  fireEvent.click(screen.getByTestId('set-name-alias'))
  await waitFor(() => expect(mockApi.scanner.createAlias).toHaveBeenCalledWith({
    disk_name: 'Surge XT', catalog_record_id: 'c1', catalog_table: 'instruments',
  }))
})

// Step 10 — success: toast + modal stays open
it('shows a success toast and keeps the modal open on alias success', async () => {
  ;(mockApi.scanner.createAlias as jest.Mock).mockResolvedValue(undefined)
  render(<SingleResolutionModal row={makeRow()} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  fireEvent.click(screen.getByTestId('set-name-alias'))
  await waitFor(() => expect(getToast().success).toHaveBeenCalledWith(expect.stringContaining('Surge XT')))
  expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
})

// Step 11 — conflict: inline error, modal stays open, no success toast
it('surfaces a 409 inline and keeps the modal open without a success toast', async () => {
  ;(mockApi.scanner.createAlias as jest.Mock).mockRejectedValue(
    new Error('Surge XT is already aliased to effects abc'),
  )
  render(<SingleResolutionModal row={makeRow()} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  fireEvent.click(screen.getByTestId('set-name-alias'))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/already aliased/i))
  expect(getToast().success).not.toHaveBeenCalled()
  expect(screen.getByTestId('set-name-alias')).toBeInTheDocument()
})

// Step 12 — independence + guard
it('does not call api.update when setting an alias, and Save still works after', async () => {
  ;(mockApi.scanner.createAlias as jest.Mock).mockResolvedValue(undefined)
  ;(mockApi.update as jest.Mock).mockResolvedValue({})
  render(<SingleResolutionModal row={makeRow()} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  fireEvent.click(screen.getByTestId('set-name-alias'))
  await waitFor(() => expect(mockApi.scanner.createAlias).toHaveBeenCalled())
  expect(mockApi.update).not.toHaveBeenCalled()
  const radios = screen.getAllByRole('radio')
  fireEvent.click(radios[0]); fireEvent.click(radios[2])
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(mockApi.update).toHaveBeenCalled())
})

it('hides Set Name Alias when the row has no matched catalog record', () => {
  render(<SingleResolutionModal
    row={makeRow({ catalog_record_id: null, catalog_record_name: null, catalog_record_vendor: null, catalog_record_version: null })}
    onClose={noop} onSaved={noop} onFireRuleToasts={noop}
  />)
  expect(screen.queryByTestId('set-name-alias')).not.toBeInTheDocument()
})

it('hides Set Name Alias when the row has a record id but no catalog table', () => {
  render(<SingleResolutionModal
    row={makeRow({ catalog_record_table: null })}
    onClose={noop} onSaved={noop} onFireRuleToasts={noop}
  />)
  expect(screen.queryByTestId('set-name-alias')).not.toBeInTheDocument()
})

// U-15: read-only mode (Q2=A — Known-row inspect view)

// Step 9 — readOnly hides the editing controls
it('renders no radios and no Save button in read-only mode', () => {
  render(<SingleResolutionModal row={makeRow()} readOnly onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  expect(screen.queryAllByRole('radio')).toHaveLength(0)
  expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
})

// Step 10 — readOnly hides Set Name Alias even with a matched record
it('hides Set Name Alias in read-only mode even when a record is matched', () => {
  render(<SingleResolutionModal row={makeRow()} readOnly onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  expect(screen.queryByTestId('set-name-alias')).not.toBeInTheDocument()
})

// Step 11 — readOnly retitles the dialog
it('titles the dialog "Match Details" in read-only mode and "Resolve Match" otherwise', () => {
  const { rerender } = render(<SingleResolutionModal row={makeRow()} readOnly onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  expect(screen.getByText('Match Details')).toBeInTheDocument()
  expect(screen.queryByText('Resolve Match')).not.toBeInTheDocument()
  rerender(<SingleResolutionModal row={makeRow()} onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  expect(screen.getByText('Resolve Match')).toBeInTheDocument()
  expect(screen.queryByText('Match Details')).not.toBeInTheDocument()
})

// Step 12 — readOnly still shows both disk and catalog values for inspection
it('shows both disk and catalog values for differing fields in read-only mode', () => {
  render(<SingleResolutionModal row={makeRow()} readOnly onClose={noop} onSaved={noop} onFireRuleToasts={noop} />)
  expect(screen.getByText('Surge XT')).toBeInTheDocument()
  expect(screen.getByText('Surge')).toBeInTheDocument()
  expect(screen.getByText('Vembertech')).toBeInTheDocument()
  expect(screen.getByText('Surge Synth Team')).toBeInTheDocument()
})
