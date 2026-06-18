import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { HardResetDialog, HARD_RESET_CONFIRMATION } from '@/components/tables/scanner/modals/HardResetDialog'

const baseProps = {
  isOpen: true,
  confirmText: '',
  isSubmitting: false,
  onConfirmTextChange: jest.fn(),
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
}

afterEach(() => jest.clearAllMocks())

it('does not render when closed', () => {
  render(<HardResetDialog {...baseProps} isOpen={false} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('renders via the shared Dialog when open', () => {
  render(<HardResetDialog {...baseProps} />)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByText('Hard Reset')).toBeInTheDocument()
})

it('Confirm is disabled until the confirmation text matches', () => {
  const { rerender } = render(<HardResetDialog {...baseProps} confirmText="" />)
  expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled()
  rerender(<HardResetDialog {...baseProps} confirmText={HARD_RESET_CONFIRMATION} />)
  expect(screen.getByRole('button', { name: /confirm/i })).not.toBeDisabled()
})

it('Confirm stays disabled while submitting even with matching text', () => {
  render(<HardResetDialog {...baseProps} confirmText={HARD_RESET_CONFIRMATION} isSubmitting />)
  expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled()
})

it('typing calls onConfirmTextChange', () => {
  const onConfirmTextChange = jest.fn()
  render(<HardResetDialog {...baseProps} onConfirmTextChange={onConfirmTextChange} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } })
  expect(onConfirmTextChange).toHaveBeenCalledWith('abc')
})

it('Confirm calls onConfirm when enabled', () => {
  const onConfirm = jest.fn()
  render(<HardResetDialog {...baseProps} confirmText={HARD_RESET_CONFIRMATION} onConfirm={onConfirm} />)
  fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
  expect(onConfirm).toHaveBeenCalled()
})

// U-17: shared Dialog close policy (BR-U17-02) — close routes to onCancel
it('the built-in Close (X) calls onCancel', () => {
  const onCancel = jest.fn()
  render(<HardResetDialog {...baseProps} onCancel={onCancel} />)
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
  expect(onCancel).toHaveBeenCalled()
})

it('closes on Escape via onCancel', () => {
  const onCancel = jest.fn()
  render(<HardResetDialog {...baseProps} onCancel={onCancel} />)
  fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })
  expect(onCancel).toHaveBeenCalled()
})
