import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { RevokeConfirmModal } from '@/components/tables/scanner/RevokeConfirmModal'
import type { ScannerApiKey } from '@/components/tables/scanner/RevokeConfirmModal'

const API_KEY: ScannerApiKey = {
  key_id: 'key-1',
  label: 'ci-runner',
  key_hint: 'abcd',
  created_at: '2026-05-01T00:00:00Z',
  revoked_at: null,
}

describe('RevokeConfirmModal', () => {
  it('renders label in warning message', () => {
    render(<RevokeConfirmModal apiKey={API_KEY} isPending={false} onConfirm={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByTestId('revoke-confirm-modal')).toBeInTheDocument()
    expect(screen.getByText('ci-runner')).toBeInTheDocument()
  })

  it('calls onCancel when cancel button clicked', () => {
    const onCancel = jest.fn()
    render(<RevokeConfirmModal apiKey={API_KEY} isPending={false} onConfirm={jest.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByTestId('revoke-cancel-button'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls onConfirm when confirm button clicked', () => {
    const onConfirm = jest.fn()
    render(<RevokeConfirmModal apiKey={API_KEY} isPending={false} onConfirm={onConfirm} onCancel={jest.fn()} />)
    fireEvent.click(screen.getByTestId('revoke-confirm-button'))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('disables confirm button when isPending', () => {
    render(<RevokeConfirmModal apiKey={API_KEY} isPending={true} onConfirm={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByTestId('revoke-confirm-button')).toBeDisabled()
    expect(screen.getByTestId('revoke-confirm-button')).toHaveTextContent('Revoking...')
  })
})
