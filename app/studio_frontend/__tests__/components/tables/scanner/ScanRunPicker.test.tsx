import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScanRunPicker } from '@/components/tables/scanner/ScanRunPicker'
import type { ScanRun } from '@/lib/types'

const runs: ScanRun[] = [
  { scan_id: 'scan1', scanned_at: '2026-05-04T12:00:00Z', source_machine: 'mac', total_count: 16, status_counts: { known: 0, matched: 10, conflicted: 2, unconfirmed: 3, untracked: 1, orphaned: 0, ignored: 0 }, confirmation_counts: { confirmed: 0, rejected: 0, ignored: 0 } },
  { scan_id: 'scan2', scanned_at: '2026-05-03T12:00:00Z', source_machine: 'mac', total_count: 12, status_counts: { known: 0, matched: 8, conflicted: 1, unconfirmed: 2, untracked: 0, orphaned: 1, ignored: 0 }, confirmation_counts: { confirmed: 0, rejected: 0, ignored: 0 } },
]

describe('ScanRunPicker', () => {
  it('renders scan run options', () => {
    render(<ScanRunPicker runs={runs} selectedId="scan1" onChange={jest.fn()} onPurge={jest.fn()} />)
    const select = screen.getByTestId('scan-run-select')
    expect(select.querySelectorAll('option')).toHaveLength(2)
  })

  it('calls onChange when a different run is selected', () => {
    const onChange = jest.fn()
    render(<ScanRunPicker runs={runs} selectedId="scan1" onChange={onChange} onPurge={jest.fn()} />)
    fireEvent.change(screen.getByTestId('scan-run-select'), { target: { value: 'scan2' } })
    expect(onChange).toHaveBeenCalledWith('scan2')
  })

  it('shows manage history panel when toggle is clicked', () => {
    render(<ScanRunPicker runs={runs} selectedId="scan1" onChange={jest.fn()} onPurge={jest.fn()} />)
    fireEvent.click(screen.getByTestId('manage-history-toggle'))
    expect(screen.getByTestId('manage-history-panel')).toBeInTheDocument()
  })

  it('shows confirmation dialog when Purge is clicked', () => {
    render(<ScanRunPicker runs={runs} selectedId="scan1" onChange={jest.fn()} onPurge={jest.fn()} />)
    fireEvent.click(screen.getByTestId('manage-history-toggle'))
    fireEvent.click(screen.getByTestId('purge-button'))
    expect(screen.getByTestId('purge-confirm-button')).toBeInTheDocument()
  })
})
