import React from 'react'
import { render, screen } from '@testing-library/react'
import { ReportRow } from '@/components/tables/scanner/report/ReportRow'
import type { RawScanResult } from '@/lib/types'

const mockRow: RawScanResult = {
  result_id: 'r-1',
  name: 'Surge XT',
  vendor: 'Surge Synth Team',
  version: '3.3.4',
  format: 'VST3',
  path: '/Library/Audio/Plug-Ins/VST3/Surge XT.vst3',
  status: 'matched',
  confidence: 'exact',
}

describe('ReportRow', () => {
  it('renders with data-testid', () => {
    render(
      <table><tbody>
        <ReportRow row={mockRow} />
      </tbody></table>
    )
    expect(screen.getByTestId('report-row')).toBeInTheDocument()
  })

  it('displays name, vendor, version, and format', () => {
    render(
      <table><tbody>
        <ReportRow row={mockRow} />
      </tbody></table>
    )
    expect(screen.getByText('Surge XT')).toBeInTheDocument()
    expect(screen.getByText('Surge Synth Team')).toBeInTheDocument()
    expect(screen.getByText('3.3.4')).toBeInTheDocument()
    expect(screen.getByText('VST3')).toBeInTheDocument()
  })

  it('path cell has title attribute equal to full path', () => {
    render(
      <table><tbody>
        <ReportRow row={mockRow} />
      </tbody></table>
    )
    const pathCell = screen.getByTitle(mockRow.path)
    expect(pathCell).toBeInTheDocument()
  })
})
