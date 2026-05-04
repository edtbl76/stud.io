import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { UntrackedRow } from '@/components/tables/scanner/rows/UntrackedRow'
import type { ScanResult } from '@/lib/types'

const result: ScanResult = {
  result_id: 'r2',
  status: 'untracked',
  name: 'Synth One',
  vendor: 'Plugin Corp',
  version: '2.1.0',
  format: 'au',
  path: '/path/synth.component',
  confidence: null,
  score: null,
  matched_record: null,
  dismissed_at: null,
}

describe('UntrackedRow', () => {
  it('renders plugin name and format', () => {
    render(<UntrackedRow result={result} onCreateRecord={jest.fn()} onIgnore={jest.fn()} />)
    expect(screen.getByText('Synth One')).toBeInTheDocument()
    expect(screen.getByText(/au/)).toBeInTheDocument()
  })

  it('calls onCreateRecord with full result when Create Record is clicked', () => {
    const onCreateRecord = jest.fn()
    render(<UntrackedRow result={result} onCreateRecord={onCreateRecord} onIgnore={jest.fn()} />)
    fireEvent.click(screen.getByTestId('create-record-button-r2'))
    expect(onCreateRecord).toHaveBeenCalledWith(result)
  })

  it('calls onIgnore with result_id when Ignore is clicked', () => {
    const onIgnore = jest.fn()
    render(<UntrackedRow result={result} onCreateRecord={jest.fn()} onIgnore={onIgnore} />)
    fireEvent.click(screen.getByTestId('ignore-button-r2'))
    expect(onIgnore).toHaveBeenCalledWith('r2')
  })
})
