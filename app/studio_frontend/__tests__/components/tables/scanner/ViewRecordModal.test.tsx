import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ViewRecordModal } from '@/components/tables/scanner/ViewRecordModal'
import type { MatchMeta } from '@/lib/types'

const match: MatchMeta = {
  confidence: 'exact',
  score: null,
  record_id: 'rec-abc-123',
  record_table: 'effects',
  record_name: 'EQ Eight',
  record_vendor: 'Ableton',
  record_version: '11.0.0',
}

describe('ViewRecordModal', () => {
  it('renders the catalog record name', () => {
    render(<ViewRecordModal match={match} onClose={jest.fn()} />)
    expect(screen.getByTestId('view-record-field-name')).toHaveTextContent('EQ Eight')
  })

  it('renders vendor, version, table, and record_id fields', () => {
    render(<ViewRecordModal match={match} onClose={jest.fn()} />)
    expect(screen.getByTestId('view-record-field-vendor')).toHaveTextContent('Ableton')
    expect(screen.getByTestId('view-record-field-version')).toHaveTextContent('11.0.0')
    expect(screen.getByTestId('view-record-field-table')).toHaveTextContent('effects')
    expect(screen.getByTestId('view-record-field-record-id')).toHaveTextContent('rec-abc-123')
  })

  it('shows "—" for null fields', () => {
    const sparse: MatchMeta = { ...match, record_vendor: null, record_version: null }
    render(<ViewRecordModal match={sparse} onClose={jest.fn()} />)
    const vendorField = screen.getByTestId('view-record-field-vendor')
    expect(vendorField).toHaveTextContent('—')
  })

  it('calls onClose when Close button is clicked', () => {
    const onClose = jest.fn()
    render(<ViewRecordModal match={match} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('view-record-close-button'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders the modal title', () => {
    render(<ViewRecordModal match={match} onClose={jest.fn()} />)
    expect(screen.getByText('Catalog Record')).toBeInTheDocument()
  })
})