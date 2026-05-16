import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConflictedRow } from '@/components/tables/scanner/rows/ConflictedRow'
import type { ScanResult } from '@/lib/types'

const baseResult: ScanResult = {
  result_id: 'r20',
  status: 'conflicted',
  name: 'Compressor Z',
  vendor: 'Dynamics Co',
  version: '1.0.0',
  format: 'vst3',
  path: '/plugins/comp.vst3',
  match: {
    confidence: 'exact',
    score: 100,
    record_id: 'rec20',
    record_table: 'effects',
    record_name: 'Compressor Z',
    record_vendor: 'Dynamics Co',
    record_version: '2.0.0',
    catalog_disk_paths: [],
  },
  dismissed_at: null,
  confirmed_at: null,
}

describe('ConflictedRow', () => {
  it('renders plugin name and both disk and catalog versions', () => {
    render(<ConflictedRow result={baseResult} selected={false} onSelect={jest.fn()} onViewRecord={jest.fn()} />)
    expect(screen.getByText('Compressor Z')).toBeInTheDocument()
    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument()
    expect(screen.getByText(/2\.0\.0/)).toBeInTheDocument()
  })

  it('calls onViewRecord with full result when row is clicked', () => {
    const onViewRecord = jest.fn()
    render(<ConflictedRow result={baseResult} selected={false} onSelect={jest.fn()} onViewRecord={onViewRecord} />)
    fireEvent.click(screen.getByTestId('conflicted-row-r20'))
    expect(onViewRecord).toHaveBeenCalledWith(baseResult)
  })

  it('calls onSelect with result_id when checkbox is clicked', () => {
    const onSelect = jest.fn()
    render(<ConflictedRow result={baseResult} selected={false} onSelect={onSelect} onViewRecord={jest.fn()} />)
    fireEvent.click(screen.getByTestId('conflicted-checkbox-r20'))
    expect(onSelect).toHaveBeenCalledWith('r20')
  })

  it('reflects selected state on checkbox', () => {
    render(<ConflictedRow result={baseResult} selected={true} onSelect={jest.fn()} onViewRecord={jest.fn()} />)
    expect(screen.getByTestId('conflicted-checkbox-r20')).toBeChecked()
  })

  it('has no inline action buttons', () => {
    render(<ConflictedRow result={baseResult} selected={false} onSelect={jest.fn()} onViewRecord={jest.fn()} />)
    expect(screen.queryByRole('button', { name: /acknowledge|confirm|reject|force|ignore/i })).not.toBeInTheDocument()
  })
})
