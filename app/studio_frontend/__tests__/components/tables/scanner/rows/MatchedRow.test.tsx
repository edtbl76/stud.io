import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MatchedRow } from '@/components/tables/scanner/rows/MatchedRow'
import type { ScanResult } from '@/lib/types'

const baseResult: ScanResult = {
  result_id: 'r10',
  status: 'matched',
  name: 'Reverb X',
  vendor: 'Acme Audio',
  version: '2.0.0',
  format: 'vst3',
  path: '/plugins/reverb.vst3',
  match: {
    confidence: 'exact',
    score: 99,
    record_id: 'rec10',
    record_table: 'effects',
    record_name: 'Reverb X',
    record_vendor: 'Acme Audio',
    record_version: '2.0.0',
    catalog_disk_paths: [],
  },
  dismissed_at: null,
  confirmed_at: null,
}

describe('MatchedRow', () => {
  it('renders plugin name and matched record name', () => {
    render(<MatchedRow result={baseResult} onViewRecord={jest.fn()} onAcknowledge={jest.fn()} />)
    expect(screen.getAllByText('Reverb X').length).toBeGreaterThanOrEqual(1)
  })

  it('calls onViewRecord with full result when row is clicked', () => {
    const onViewRecord = jest.fn()
    render(<MatchedRow result={baseResult} onViewRecord={onViewRecord} onAcknowledge={jest.fn()} />)
    fireEvent.click(screen.getByTestId('matched-row-r10'))
    expect(onViewRecord).toHaveBeenCalledWith(baseResult)
  })

  it('renders Acknowledge button when confirmed_at is null', () => {
    render(<MatchedRow result={baseResult} onViewRecord={jest.fn()} onAcknowledge={jest.fn()} />)
    expect(screen.getByTestId('acknowledge-button-r10')).toBeInTheDocument()
  })

  it('calls onAcknowledge with result_id when Acknowledge is clicked', () => {
    const onAcknowledge = jest.fn()
    render(<MatchedRow result={baseResult} onViewRecord={jest.fn()} onAcknowledge={onAcknowledge} />)
    fireEvent.click(screen.getByTestId('acknowledge-button-r10'))
    expect(onAcknowledge).toHaveBeenCalledWith('r10')
  })

  it('shows confirmed indicator and hides Acknowledge button when confirmed_at is set', () => {
    const confirmedResult = { ...baseResult, confirmed_at: '2026-05-15T10:00:00Z' }
    render(<MatchedRow result={confirmedResult} onViewRecord={jest.fn()} onAcknowledge={jest.fn()} />)
    expect(screen.queryByTestId('acknowledge-button-r10')).not.toBeInTheDocument()
    expect(screen.getByTestId('confirmed-indicator-r10')).toBeInTheDocument()
  })
})
