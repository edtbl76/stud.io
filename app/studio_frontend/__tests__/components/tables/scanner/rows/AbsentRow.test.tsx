import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { AbsentRow } from '@/components/tables/scanner/rows/AbsentRow'
import type { AbsentRecord } from '@/lib/types'

const baseRecord: AbsentRecord = {
  record_id: 'rec-abs-1',
  record_table: 'effects',
  name: 'Reverb Pro',
  vendor: 'Acme Audio',
  version: '2.0.0',
  disk_paths: [{ path: '/Library/VST3/Reverb.vst3', format: 'vst3', version: '2.0.0' }],
}

describe('AbsentRow', () => {
  it('renders the catalog record name and vendor', () => {
    render(<AbsentRow record={baseRecord} />)
    expect(screen.getByText('Reverb Pro')).toBeInTheDocument()
    expect(screen.getByText(/Acme Audio/)).toBeInTheDocument()
  })

  it('renders the expected disk path', () => {
    render(<AbsentRow record={baseRecord} />)
    expect(screen.getByText(/Library\/VST3\/Reverb\.vst3/)).toBeInTheDocument()
  })

  it('renders the record table', () => {
    render(<AbsentRow record={baseRecord} />)
    expect(screen.getByText(/effects/)).toBeInTheDocument()
  })

  it('renders the version string in the subtitle', () => {
    render(<AbsentRow record={baseRecord} />)
    expect(screen.getByText(/2\.0\.0/)).toBeInTheDocument()
  })

  it('renders all disk paths when multiple are present', () => {
    const multiPath: AbsentRecord = {
      ...baseRecord,
      disk_paths: [
        { path: '/Library/VST3/Reverb.vst3', format: 'vst3', version: '2.0.0' },
        { path: '/Volumes/External/Plugins/Reverb.vst3', format: 'vst3', version: '2.0.0' },
      ],
    }
    render(<AbsentRow record={multiPath} />)
    expect(screen.getByText(/Library\/VST3\/Reverb\.vst3/)).toBeInTheDocument()
    expect(screen.getByText(/Volumes\/External\/Plugins/)).toBeInTheDocument()
  })

  it('renders without disk paths gracefully', () => {
    render(<AbsentRow record={{ ...baseRecord, disk_paths: [] }} />)
    expect(screen.getByTestId(`absent-row-${baseRecord.record_id}`)).toBeInTheDocument()
  })
})
