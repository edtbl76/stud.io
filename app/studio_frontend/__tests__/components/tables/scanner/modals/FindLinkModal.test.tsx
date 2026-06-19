import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { FindLinkModal } from '@/components/tables/scanner/modals/FindLinkModal'

const mockSetQuery = jest.fn()
const mockConfirmLink = jest.fn()
const mockToggleCandidate = jest.fn()

const BASE_HOOK = {
  candidates: [
    { result_id: 'r1', display_name: 'Surge XT', disk_vendor: 'Surge Synth', disk_version: '1.0', disk_format: 'VST3',
      disk_name: 'Surge', disk_path: '/p', display_vendor: 'Surge Synth',
      catalog_record_id: null, catalog_record_table: null, catalog_record_name: null,
      catalog_record_vendor: null, catalog_record_version: null,
      bucket: 'unlinked' as const, confidence: null, confirmed_at: null, confirmed_by: null },
    { result_id: 'r2', display_name: 'Serum', disk_vendor: 'Xfer', disk_version: '1.3', disk_format: 'VST3',
      disk_name: 'Serum', disk_path: '/p', display_vendor: 'Xfer',
      catalog_record_id: null, catalog_record_table: null, catalog_record_name: null,
      catalog_record_vendor: null, catalog_record_version: null,
      bucket: 'unlinked' as const, confidence: null, confirmed_at: null, confirmed_by: null },
  ],
  isLoading: false,
  query: '',
  setQuery: mockSetQuery,
  selectedIds: new Set<string>(),
  toggleCandidate: mockToggleCandidate,
  confirmLink: mockConfirmLink,
  isSubmitting: false,
}

jest.mock('@/lib/useFindLink', () => ({
  useFindLink: jest.fn(() => BASE_HOOK),
}))

import { useFindLink } from '@/lib/useFindLink'
const mockUseFindLink = useFindLink as jest.Mock

afterEach(() => jest.clearAllMocks())

// Step 71
it('renders candidate names from useFindLink', () => {
  render(<FindLinkModal mode="orphaned-to-unlinked" sourceId="s1" onClose={jest.fn()} onLinked={jest.fn()} />)
  expect(screen.getByText('Surge XT')).toBeInTheDocument()
  expect(screen.getByText('Serum')).toBeInTheDocument()
})

// Step 72
it('renders search input', () => {
  render(<FindLinkModal mode="orphaned-to-unlinked" sourceId="s1" onClose={jest.fn()} onLinked={jest.fn()} />)
  expect(screen.getByRole('textbox', { name: /search/i })).toBeInTheDocument()
})

it('typing in search calls setQuery', () => {
  render(<FindLinkModal mode="orphaned-to-unlinked" sourceId="s1" onClose={jest.fn()} onLinked={jest.fn()} />)
  fireEvent.change(screen.getByRole('textbox', { name: /search/i }), { target: { value: 'Surge' } })
  expect(mockSetQuery).toHaveBeenCalledWith('Surge')
})

// Step 73
it('Confirm button disabled when no selection', () => {
  render(<FindLinkModal mode="orphaned-to-unlinked" sourceId="s1" onClose={jest.fn()} onLinked={jest.fn()} />)
  expect(screen.getByRole('button', { name: /link/i })).toBeDisabled()
})

it('shows "Link" label for unlinked-to-orphaned mode with 1 selected', () => {
  mockUseFindLink.mockReturnValue({ ...BASE_HOOK, selectedIds: new Set(['r1']) })
  render(<FindLinkModal mode="unlinked-to-orphaned" sourceId="s1" onClose={jest.fn()} onLinked={jest.fn()} />)
  expect(screen.getByRole('button', { name: /^link$/i })).not.toBeDisabled()
})

it('shows "Link 2 entries" for orphaned-to-unlinked mode with 2 selected', () => {
  mockUseFindLink.mockReturnValue({ ...BASE_HOOK, selectedIds: new Set(['r1', 'r2']) })
  render(<FindLinkModal mode="orphaned-to-unlinked" sourceId="s1" onClose={jest.fn()} onLinked={jest.fn()} />)
  expect(screen.getByRole('button', { name: /link 2 entries/i })).not.toBeDisabled()
})

// U-17: shared Dialog migration + close policy (BR-U17-02)
it('renders via the shared Dialog with a built-in Close (X) that calls onClose', () => {
  const onClose = jest.fn()
  render(<FindLinkModal mode="orphaned-to-unlinked" sourceId="s1" onClose={onClose} onLinked={jest.fn()} />)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
  expect(onClose).toHaveBeenCalled()
})

it('closes on Escape', () => {
  const onClose = jest.fn()
  render(<FindLinkModal mode="orphaned-to-unlinked" sourceId="s1" onClose={onClose} onLinked={jest.fn()} />)
  fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})
