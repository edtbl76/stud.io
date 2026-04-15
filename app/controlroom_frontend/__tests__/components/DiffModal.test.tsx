import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiffModal } from '@/components/DiffModal'
import type { AuditEntryWithData } from '@/lib/types'

jest.mock('@/lib/computeDiff', () => ({
  computeDiff: jest.fn(() => [{ field: 'effect_name', from: 'Old Name', to: 'New Name' }]),
  formatDiffValue: jest.fn((v: unknown) => String(v)),
}))

const base: AuditEntryWithData = {
  audit_id: 'aaa-001',
  table_name: 'effects',
  record_id: 'bbb-001',
  operation: 'UPDATE',
  performed_by: 'admin',
  performed_at: new Date(Date.now() - 60000).toISOString(),
  acknowledged_at: null,
  acknowledged_by: null,
  undone_at: null,
  undone_by: null,
  record_display_name: 'Bass Comp',
  old_data: { effect_name: 'Old Name' },
  new_data: { effect_name: 'New Name' },
}

describe('DiffModal', () => {
  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn()
    render(<DiffModal entry={base} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape key is pressed', () => {
    const onClose = jest.fn()
    render(<DiffModal entry={base} onClose={onClose} />)
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows record display name in header', () => {
    render(<DiffModal entry={base} onClose={jest.fn()} />)
    expect(screen.getByText('Bass Comp')).toBeInTheDocument()
  })

  it('renders diff table for UPDATE with changes', () => {
    render(<DiffModal entry={base} onClose={jest.fn()} />)
    expect(screen.getByText('Field')).toBeInTheDocument()
    expect(screen.getByText('Before')).toBeInTheDocument()
    expect(screen.getByText('After')).toBeInTheDocument()
    expect(screen.getByText('effect_name')).toBeInTheDocument()
  })

  it('shows no changes message when diff is empty', () => {
    const { computeDiff } = require('@/lib/computeDiff') as { computeDiff: jest.Mock }
    computeDiff.mockReturnValueOnce([])
    render(<DiffModal entry={base} onClose={jest.fn()} />)
    expect(screen.getByText('No field changes recorded.')).toBeInTheDocument()
  })

  it('renders CREATE entry with field/value columns', () => {
    const entry: AuditEntryWithData = {
      ...base,
      operation: 'CREATE',
      old_data: null,
      new_data: { effect_name: 'Brand New' },
    }
    render(<DiffModal entry={entry} onClose={jest.fn()} />)
    expect(screen.getByText('Value')).toBeInTheDocument()
    expect(screen.getByText('effect_name')).toBeInTheDocument()
  })

  it('renders DELETE entry with value-at-deletion column', () => {
    const entry: AuditEntryWithData = {
      ...base,
      operation: 'DELETE',
      old_data: { effect_name: 'Gone' },
      new_data: null,
    }
    render(<DiffModal entry={entry} onClose={jest.fn()} />)
    expect(screen.getByText('Value at deletion')).toBeInTheDocument()
  })

  it('shows no-data message when data is null', () => {
    const entry: AuditEntryWithData = {
      ...base,
      operation: 'CREATE',
      old_data: null,
      new_data: null,
    }
    render(<DiffModal entry={entry} onClose={jest.fn()} />)
    expect(screen.getByText('No data available for this entry.')).toBeInTheDocument()
  })

  it('falls back to truncated record_id when no display name', () => {
    const entry: AuditEntryWithData = { ...base, record_display_name: null, record_id: 'abcd1234-rest' }
    render(<DiffModal entry={entry} onClose={jest.fn()} />)
    expect(screen.getByText('abcd1234')).toBeInTheDocument()
  })
})
