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
  confirmed_at: null,
  match: {
    confidence: 'exact',
    score: 1.0,
    record_id: 'rec-1',
    record_table: 'effects',
    record_name: 'Reverb Pro',
    record_vendor: 'Acme Audio',
    record_version: '1.0.0',
    catalog_disk_paths: [],
  },
}

const MATCHED_RESULT: ScanResult = { ...RESULT, status: 'matched' }
const CONFLICTED_RESULT: ScanResult = { ...RESULT, status: 'version_mismatch', match: { ...RESULT.match!, record_version: '2.0.0' } }

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

  it('shows Acknowledge button for matched-status results', () => {
    render(<ViewRecordModal result={MATCHED_RESULT} onClose={jest.fn()} onAcknowledge={jest.fn()} />)
    expect(screen.getByTestId('view-record-acknowledge-button')).toBeInTheDocument()
  })

  it('hides Acknowledge button for conflicted results', () => {
    render(<ViewRecordModal result={CONFLICTED_RESULT} onClose={jest.fn()} onAcknowledge={jest.fn()} />)
    expect(screen.queryByTestId('view-record-acknowledge-button')).not.toBeInTheDocument()
  })

  it('calls onAcknowledge with result_id when Acknowledge is clicked', () => {
    const onAcknowledge = jest.fn()
    render(<ViewRecordModal result={MATCHED_RESULT} onClose={jest.fn()} onAcknowledge={onAcknowledge} />)
    fireEvent.click(screen.getByTestId('view-record-acknowledge-button'))
    expect(onAcknowledge).toHaveBeenCalledWith('r1')
  })

  it('shows confirmed badge when confirmed_at is set', () => {
    const confirmed = { ...MATCHED_RESULT, confirmed_at: '2026-05-15T10:00:00Z' }
    render(<ViewRecordModal result={confirmed} onClose={jest.fn()} onAcknowledge={jest.fn()} />)
    expect(screen.getByTestId('view-record-confirmed-badge')).toBeInTheDocument()
  })

  it('shows disk and catalog versions side-by-side for conflicted results', () => {
    render(<ViewRecordModal result={CONFLICTED_RESULT} onClose={jest.fn()} />)
    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument()
    expect(screen.getByText(/2\.0\.0/)).toBeInTheDocument()
  })
})
