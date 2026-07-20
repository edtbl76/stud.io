import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { BulkConfirmDialog } from '@/components/tables/scanner/workbench/BulkConfirmDialog'
import type { ConfirmationRequest } from '@/lib/bulkConfirmation'

function req(overrides: Partial<ConfirmationRequest> = {}): ConfirmationRequest {
  return {
    kind: 'reject', selectedCount: 3, affectedCount: 1,
    skippedCount: 2, skipReason: 'not in a rejectable state', destructive: true,
    ...overrides,
  }
}

const baseProps = { onConfirm: jest.fn(), onCancel: jest.fn() }

afterEach(() => jest.clearAllMocks())

// ── Step 17: render gating ──────────────────────────────────────────────────
it('renders nothing when request is null', () => {
  render(<BulkConfirmDialog request={null} {...baseProps} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('renders the shared Dialog when request is present', () => {
  render(<BulkConfirmDialog request={req()} {...baseProps} />)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByTestId('bulk-confirm-dialog')).toBeInTheDocument()
})

// ── Step 18: summary + title ────────────────────────────────────────────────
it('renders the summary line and a kind-specific title', () => {
  render(<BulkConfirmDialog request={req()} {...baseProps} />)
  expect(screen.getByText('Reject 1 of 3 selected? (2 skipped: not in a rejectable state.)')).toBeInTheDocument()
  expect(screen.getByText(/reject matches/i)).toBeInTheDocument()
})

it('renders the exclude summary and title', () => {
  render(<BulkConfirmDialog request={req({ kind: 'exclude', selectedCount: 5, affectedCount: 5, skippedCount: 0, skipReason: null })} {...baseProps} />)
  expect(screen.getByText('Exclude 5 entries?')).toBeInTheDocument()
  expect(screen.getByText(/exclude entries/i)).toBeInTheDocument()
})

// ── Step 19: disabled when nothing affected ─────────────────────────────────
it('disables the confirm button when affectedCount is 0', () => {
  render(<BulkConfirmDialog request={req({ affectedCount: 0, skippedCount: 3 })} {...baseProps} />)
  expect(screen.getByTestId('bulk-confirm-submit')).toBeDisabled()
})

it('enables the confirm button when at least one row is affected', () => {
  render(<BulkConfirmDialog request={req({ affectedCount: 1 })} {...baseProps} />)
  expect(screen.getByTestId('bulk-confirm-submit')).not.toBeDisabled()
})

// ── Step 20: destructive framing ────────────────────────────────────────────
it('a destructive request styles the confirm button destructively and focuses Cancel', () => {
  render(<BulkConfirmDialog request={req({ destructive: true })} {...baseProps} />)
  expect(screen.getByTestId('bulk-confirm-submit')).toHaveClass('bg-destructive')
  expect(screen.getByTestId('bulk-confirm-cancel')).toHaveFocus()
})

it('a neutral (bulk-update) request does not style the confirm button destructively', () => {
  render(<BulkConfirmDialog request={req({ kind: 'bulk-update', destructive: false, affectedCount: 2, skippedCount: 0, skipReason: null })} {...baseProps} />)
  expect(screen.getByTestId('bulk-confirm-submit')).not.toHaveClass('bg-destructive')
})

// ── Step 21: confirm / cancel / X / ESC ─────────────────────────────────────
it('Confirm click calls onConfirm', () => {
  const onConfirm = jest.fn()
  render(<BulkConfirmDialog request={req({ affectedCount: 1 })} {...baseProps} onConfirm={onConfirm} />)
  fireEvent.click(screen.getByTestId('bulk-confirm-submit'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
})

it('Cancel click calls onCancel', () => {
  const onCancel = jest.fn()
  render(<BulkConfirmDialog request={req()} {...baseProps} onCancel={onCancel} />)
  fireEvent.click(screen.getByTestId('bulk-confirm-cancel'))
  expect(onCancel).toHaveBeenCalledTimes(1)
})

it('the built-in Close (X) calls onCancel', () => {
  const onCancel = jest.fn()
  render(<BulkConfirmDialog request={req()} {...baseProps} onCancel={onCancel} />)
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
  expect(onCancel).toHaveBeenCalled()
})

it('Escape calls onCancel', () => {
  const onCancel = jest.fn()
  render(<BulkConfirmDialog request={req()} {...baseProps} onCancel={onCancel} />)
  fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })
  expect(onCancel).toHaveBeenCalled()
})
