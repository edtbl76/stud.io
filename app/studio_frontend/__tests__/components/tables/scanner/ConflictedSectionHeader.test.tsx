import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConflictedSectionHeader } from '@/components/tables/scanner/ConflictedSectionHeader'

const DEFAULT_PROPS = {
  count: 5,
  selectedCount: 0,
  hideConfirmed: true,
  onToggleHideConfirmed: jest.fn(),
  onBulkUpdate: jest.fn(),
}

describe('ConflictedSectionHeader', () => {
  it('renders the title and result count', () => {
    render(<ConflictedSectionHeader {...DEFAULT_PROPS} />)
    expect(screen.getByText('Conflicted')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('hides Bulk Update button when selectedCount is 0', () => {
    render(<ConflictedSectionHeader {...DEFAULT_PROPS} />)
    expect(screen.queryByTestId('bulk-update-button')).not.toBeInTheDocument()
  })

  it('shows Bulk Update button with count when selectedCount > 0', () => {
    render(<ConflictedSectionHeader {...DEFAULT_PROPS} selectedCount={3} />)
    const btn = screen.getByTestId('bulk-update-button')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent('3')
  })

  it('calls onBulkUpdate when Bulk Update is clicked', () => {
    const onBulkUpdate = jest.fn()
    render(<ConflictedSectionHeader {...DEFAULT_PROPS} selectedCount={2} onBulkUpdate={onBulkUpdate} />)
    fireEvent.click(screen.getByTestId('bulk-update-button'))
    expect(onBulkUpdate).toHaveBeenCalled()
  })

  it('shows "Show confirmed" when hideConfirmed is true', () => {
    render(<ConflictedSectionHeader {...DEFAULT_PROPS} hideConfirmed={true} />)
    expect(screen.getByTestId('toggle-hide-confirmed')).toHaveTextContent('Show confirmed')
  })

  it('shows "Hide confirmed" when hideConfirmed is false', () => {
    render(<ConflictedSectionHeader {...DEFAULT_PROPS} hideConfirmed={false} />)
    expect(screen.getByTestId('toggle-hide-confirmed')).toHaveTextContent('Hide confirmed')
  })

  it('calls onToggleHideConfirmed when toggle is clicked', () => {
    const onToggle = jest.fn()
    render(<ConflictedSectionHeader {...DEFAULT_PROPS} onToggleHideConfirmed={onToggle} />)
    fireEvent.click(screen.getByTestId('toggle-hide-confirmed'))
    expect(onToggle).toHaveBeenCalled()
  })
})
