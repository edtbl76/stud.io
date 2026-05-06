import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { BulkActionBar } from '@/components/tables/scanner/BulkActionBar'

describe('BulkActionBar', () => {
  it('renders button with correct count', () => {
    render(<BulkActionBar highConfidenceCount={5} onConfirmAll={jest.fn()} />)
    expect(screen.getByTestId('confirm-all-high-confidence-button')).toBeInTheDocument()
    expect(screen.getByTestId('high-confidence-count')).toHaveTextContent('5 matches')
  })

  it('disables button when count is 0', () => {
    render(<BulkActionBar highConfidenceCount={0} onConfirmAll={jest.fn()} />)
    expect(screen.getByTestId('confirm-all-high-confidence-button')).toBeDisabled()
  })

  it('calls onConfirmAll when clicked', () => {
    const onConfirmAll = jest.fn()
    render(<BulkActionBar highConfidenceCount={3} onConfirmAll={onConfirmAll} />)
    fireEvent.click(screen.getByTestId('confirm-all-high-confidence-button'))
    expect(onConfirmAll).toHaveBeenCalledTimes(1)
  })

  it('shows singular "match" for count of 1', () => {
    render(<BulkActionBar highConfidenceCount={1} onConfirmAll={jest.fn()} />)
    expect(screen.getByTestId('high-confidence-count')).toHaveTextContent('1 match')
  })
})
