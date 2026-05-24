import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateRecordModal } from '@/components/tables/scanner/modals/CreateRecordModal'
import type { WorkbenchRow } from '@/lib/types'

jest.mock('@/lib/api', () => ({
  api: {
    create: jest.fn(),
    scanner: {
      createLink: jest.fn(),
    },
  },
}))

import { api } from '@/lib/api'
const mockApi = api as jest.Mocked<typeof api>

function makeRow(overrides: Partial<WorkbenchRow> = {}): WorkbenchRow {
  return {
    result_id: 'r1', disk_name: 'Surge XT', disk_vendor: 'Vembertech', disk_version: '1.3', disk_format: 'VST3',
    disk_path: '/p', display_name: 'Surge XT', display_vendor: 'Vembertech',
    catalog_record_id: null, catalog_record_table: null, catalog_record_name: null,
    catalog_record_vendor: null, catalog_record_version: null,
    bucket: 'unlinked', confidence: null, confirmed_at: null, confirmed_by: null,
    ...overrides,
  }
}

const noop = jest.fn()
afterEach(() => jest.resetAllMocks())

// Step 74
it('pre-populates name, vendor, version, format from disk values', () => {
  render(<CreateRecordModal row={makeRow()} onClose={noop} onSaved={noop} />)
  expect(screen.getByDisplayValue('Surge XT')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Vembertech')).toBeInTheDocument()
  expect(screen.getByDisplayValue('1.3')).toBeInTheDocument()
  expect(screen.getByDisplayValue('VST3')).toBeInTheDocument()
})

// Step 75
it('Save button disabled until catalog type selected', () => {
  render(<CreateRecordModal row={makeRow()} onClose={noop} onSaved={noop} />)
  expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
})

it('Save button enabled after catalog type selected', () => {
  render(<CreateRecordModal row={makeRow()} onClose={noop} onSaved={noop} />)
  fireEvent.change(screen.getByRole('combobox', { name: /catalog type/i }), { target: { value: 'instruments' } })
  expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
})

// Step 76
it('POSTs to catalog then creates link on Save', async () => {
  ;(mockApi.create as jest.Mock).mockResolvedValue({ id: 'newCat1' })
  ;(mockApi.scanner.createLink as jest.Mock).mockResolvedValue({ created: 1, errors: [] })
  render(<CreateRecordModal row={makeRow()} onClose={noop} onSaved={noop} />)
  fireEvent.change(screen.getByRole('combobox', { name: /catalog type/i }), { target: { value: 'instruments' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(mockApi.create).toHaveBeenCalledWith(
    '/catalog/instruments', expect.objectContaining({ name: 'Surge XT', vendor: 'Vembertech' })
  ))
  await waitFor(() => expect(mockApi.scanner.createLink).toHaveBeenCalledWith(
    expect.objectContaining({ result_id: 'r1', catalog_record_id: 'newCat1', catalog_record_table: 'instruments' })
  ))
})

// Step 77
it('shows inline error when catalog POST fails; link not called', async () => {
  ;(mockApi.create as jest.Mock).mockRejectedValue(new Error('Server error'))
  render(<CreateRecordModal row={makeRow()} onClose={noop} onSaved={noop} />)
  fireEvent.change(screen.getByRole('combobox', { name: /catalog type/i }), { target: { value: 'instruments' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  expect(mockApi.scanner.createLink).not.toHaveBeenCalled()
})

// Step 78
it('calls onSaved after successful save', async () => {
  ;(mockApi.create as jest.Mock).mockResolvedValue({ id: 'newCat1' })
  ;(mockApi.scanner.createLink as jest.Mock).mockResolvedValue({ created: 1, errors: [] })
  const onSaved = jest.fn()
  render(<CreateRecordModal row={makeRow()} onClose={noop} onSaved={onSaved} />)
  fireEvent.change(screen.getByRole('combobox', { name: /catalog type/i }), { target: { value: 'instruments' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
})
