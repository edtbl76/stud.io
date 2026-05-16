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
  match: null,
  dismissed_at: null,
  confirmed_at: null,
}

describe('UntrackedRow', () => {
  it('renders plugin name and format', () => {
    render(<UntrackedRow result={result} onCreateRecord={jest.fn()} onIgnore={jest.fn()} onOverride={jest.fn()} />)
    expect(screen.getByText('Synth One')).toBeInTheDocument()
    expect(screen.getByText(/au/)).toBeInTheDocument()
  })

  it('calls onCreateRecord with full result when Create Record is clicked', () => {
    const onCreateRecord = jest.fn()
    render(<UntrackedRow result={result} onCreateRecord={onCreateRecord} onIgnore={jest.fn()} onOverride={jest.fn()} />)
    fireEvent.click(screen.getByTestId('create-record-button-r2'))
    expect(onCreateRecord).toHaveBeenCalledWith(result)
  })

  it('calls onIgnore with result_id when Ignore is clicked', () => {
    const onIgnore = jest.fn()
    render(<UntrackedRow result={result} onCreateRecord={jest.fn()} onIgnore={onIgnore} onOverride={jest.fn()} />)
    fireEvent.click(screen.getByTestId('ignore-button-r2'))
    expect(onIgnore).toHaveBeenCalledWith('r2')
  })

  it('renders Override button', () => {
    render(<UntrackedRow result={result} onCreateRecord={jest.fn()} onIgnore={jest.fn()} onOverride={jest.fn()} />)
    expect(screen.getByTestId('override-button-r2')).toBeInTheDocument()
  })

  it('calls onOverride with full result when Override is clicked', () => {
    const onOverride = jest.fn()
    render(<UntrackedRow result={result} onCreateRecord={jest.fn()} onIgnore={jest.fn()} onOverride={onOverride} />)
    fireEvent.click(screen.getByTestId('override-button-r2'))
    expect(onOverride).toHaveBeenCalledWith(result)
  })
})
