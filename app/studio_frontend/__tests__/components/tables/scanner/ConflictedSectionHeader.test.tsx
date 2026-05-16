import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConflictedSectionHeader } from '@/components/tables/scanner/ConflictedSectionHeader'

describe('ConflictedSectionHeader', () => {
  it('renders the title and result count', () => {
    render(<ConflictedSectionHeader count={5} selectedCount={0} onBulkUpdate={jest.fn()} />)
    expect(screen.getByText('Conflicted')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('hides Bulk Update button when selectedCount is 0', () => {
    render(<ConflictedSectionHeader count={5} selectedCount={0} onBulkUpdate={jest.fn()} />)
    expect(screen.queryByTestId('bulk-update-button')).not.toBeInTheDocument()
  })

  it('shows Bulk Update button with count when selectedCount > 0', () => {
    render(<ConflictedSectionHeader count={5} selectedCount={3} onBulkUpdate={jest.fn()} />)
    const btn = screen.getByTestId('bulk-update-button')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent('3')
  })

  it('calls onBulkUpdate when Bulk Update is clicked', () => {
    const onBulkUpdate = jest.fn()
    render(<ConflictedSectionHeader count={5} selectedCount={2} onBulkUpdate={onBulkUpdate} />)
    fireEvent.click(screen.getByTestId('bulk-update-button'))
    expect(onBulkUpdate).toHaveBeenCalled()
  })
})
