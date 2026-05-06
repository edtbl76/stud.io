import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ViewRecordModal } from '@/components/tables/scanner/ViewRecordModal'
import type { ScanResult } from '@/lib/types'

const RESULT: ScanResult = {
  result_id: 'r1',
  status: 'orphaned',
  name: 'Reverb Pro',
  vendor: 'Acme Audio',
  version: '1.0.0',
  format: 'vst3',
  path: '/path/reverb.vst3',
  dismissed_at: null,
  match: {
    confidence: 'exact',
    score: 1.0,
    record_id: 'rec-1',
    record_table: 'effects',
    record_name: 'Reverb Pro',
    record_vendor: 'Acme Audio',
    record_version: '1.0.0',
  },
}

describe('ViewRecordModal', () => {
  it('renders record details', () => {
    render(<ViewRecordModal result={RESULT} onClose={jest.fn()} />)
    expect(screen.getByTestId('view-record-modal')).toBeInTheDocument()
    expect(screen.getByText('effects')).toBeInTheDocument()
    expect(screen.getAllByText('Reverb Pro').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Acme Audio').length).toBeGreaterThan(0)
    expect(screen.getByText('rec-1')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn()
    render(<ViewRecordModal result={RESULT} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('view-record-close-button'))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders fallback values when match is null', () => {
    const noMatch: ScanResult = { ...RESULT, match: null }
    render(<ViewRecordModal result={noMatch} onClose={jest.fn()} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Reverb Pro').length).toBeGreaterThan(0)
  })
})
