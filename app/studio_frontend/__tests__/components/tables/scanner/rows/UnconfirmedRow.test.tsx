import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { UnconfirmedRow } from '@/components/tables/scanner/rows/UnconfirmedRow'
import type { ScanResult } from '@/lib/types'

const baseResult: ScanResult = {
  result_id: 'r1',
  status: 'unconfirmed',
  name: 'Reverb Pro',
  vendor: 'Acme Audio',
  version: '1.0.0',
  format: 'vst3',
  path: '/path/reverb.vst3',
  match: { confidence: 'high', score: 92, record_id: 'rec1', record_table: 'effects', record_name: 'Reverb Pro', record_vendor: 'Acme Audio', record_version: '1.0.0' },
  dismissed_at: null,
}

describe('UnconfirmedRow', () => {
  it('renders plugin name, vendor and confidence badge', () => {
    render(<UnconfirmedRow result={baseResult} onConfirm={jest.fn()} onReject={jest.fn()} onIgnore={jest.fn()} />)
    expect(screen.getAllByText('Reverb Pro').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTestId('confidence-badge')).toHaveTextContent('high')
  })

  it('calls onConfirm with result_id when Confirm is clicked', () => {
    const onConfirm = jest.fn()
    render(<UnconfirmedRow result={baseResult} onConfirm={onConfirm} onReject={jest.fn()} onIgnore={jest.fn()} />)
    fireEvent.click(screen.getByTestId('confirm-button-r1'))
    expect(onConfirm).toHaveBeenCalledWith('r1')
  })

  it('calls onReject with result_id when Reject is clicked', () => {
    const onReject = jest.fn()
    render(<UnconfirmedRow result={baseResult} onConfirm={jest.fn()} onReject={onReject} onIgnore={jest.fn()} />)
    fireEvent.click(screen.getByTestId('reject-button-r1'))
    expect(onReject).toHaveBeenCalledWith('r1')
  })

  it('calls onIgnore with result_id when Ignore is clicked', () => {
    const onIgnore = jest.fn()
    render(<UnconfirmedRow result={baseResult} onConfirm={jest.fn()} onReject={jest.fn()} onIgnore={onIgnore} />)
    fireEvent.click(screen.getByTestId('ignore-button-r1'))
    expect(onIgnore).toHaveBeenCalledWith('r1')
  })

  it('renders correct confidence badge color class for low confidence', () => {
    const lowResult = { ...baseResult, match: { ...baseResult.match!, confidence: 'low' } }
    render(<UnconfirmedRow result={lowResult} onConfirm={jest.fn()} onReject={jest.fn()} onIgnore={jest.fn()} />)
    expect(screen.getByTestId('confidence-badge')).toHaveTextContent('low')
  })
})
