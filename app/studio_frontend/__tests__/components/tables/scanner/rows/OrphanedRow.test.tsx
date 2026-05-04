import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { OrphanedRow } from '@/components/tables/scanner/rows/OrphanedRow'
import type { ScanResult } from '@/lib/types'

const result: ScanResult = {
  result_id: 'r3',
  status: 'orphaned',
  name: 'EQ Eight',
  vendor: 'Ableton',
  version: '1.0.0',
  format: 'vst3',
  path: '/old/path/eq.vst3',
  confidence: null,
  score: null,
  matched_record: { record_id: 'rec3', record_table: 'effects', name: 'EQ Eight', vendor: 'Ableton', version: '1.0.0' },
  dismissed_at: null,
}

describe('OrphanedRow', () => {
  it('renders matched record name', () => {
    render(<OrphanedRow result={result} onDismiss={jest.fn()} onKeepPermanently={jest.fn()} onRemoveFromCatalog={jest.fn()} onViewRecord={jest.fn()} />)
    expect(screen.getByText('EQ Eight')).toBeInTheDocument()
  })

  it('calls onDismiss with result_id when Dismiss is clicked', () => {
    const onDismiss = jest.fn()
    render(<OrphanedRow result={result} onDismiss={onDismiss} onKeepPermanently={jest.fn()} onRemoveFromCatalog={jest.fn()} onViewRecord={jest.fn()} />)
    fireEvent.click(screen.getByTestId('dismiss-button-r3'))
    expect(onDismiss).toHaveBeenCalledWith('r3')
  })

  it('calls onKeepPermanently with result_id when Keep is clicked', () => {
    const onKeep = jest.fn()
    render(<OrphanedRow result={result} onDismiss={jest.fn()} onKeepPermanently={onKeep} onRemoveFromCatalog={jest.fn()} onViewRecord={jest.fn()} />)
    fireEvent.click(screen.getByTestId('keep-button-r3'))
    expect(onKeep).toHaveBeenCalledWith('r3')
  })

  it('calls onRemoveFromCatalog with full result when Remove is clicked', () => {
    const onRemove = jest.fn()
    render(<OrphanedRow result={result} onDismiss={jest.fn()} onKeepPermanently={jest.fn()} onRemoveFromCatalog={onRemove} onViewRecord={jest.fn()} />)
    fireEvent.click(screen.getByTestId('remove-button-r3'))
    expect(onRemove).toHaveBeenCalledWith(result)
  })

  it('calls onViewRecord with full result when View Record is clicked', () => {
    const onViewRecord = jest.fn()
    render(<OrphanedRow result={result} onDismiss={jest.fn()} onKeepPermanently={jest.fn()} onRemoveFromCatalog={jest.fn()} onViewRecord={onViewRecord} />)
    fireEvent.click(screen.getByTestId('view-record-button-r3'))
    expect(onViewRecord).toHaveBeenCalledWith(result)
  })
})
