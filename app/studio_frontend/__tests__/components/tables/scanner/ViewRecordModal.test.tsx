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
const KNOWN_RESULT: ScanResult = { ...RESULT, status: 'known' }
const CONFLICTED_RESULT: ScanResult = {
  ...RESULT,
  status: 'conflicted',
  match: { ...RESULT.match!, record_version: '2.0.0' },
}
const CONFLICTED_ALL_FIELDS: ScanResult = {
  ...RESULT,
  status: 'conflicted',
  name: 'Reverb Pro Disk',
  vendor: 'Acme Disk',
  version: '3.0.0',
  match: {
    ...RESULT.match!,
    record_name: 'Reverb Pro Catalog',
    record_vendor: 'Acme Catalog',
    record_version: '2.0.0',
  },
}

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

  it('shows Acknowledge button for known-status results', () => {
    render(<ViewRecordModal result={KNOWN_RESULT} onClose={jest.fn()} onAcknowledge={jest.fn()} />)
    expect(screen.getByTestId('view-record-acknowledge-button')).toBeInTheDocument()
  })

  it('hides Acknowledge button for conflicted results', () => {
    render(<ViewRecordModal result={CONFLICTED_RESULT} onClose={jest.fn()} onAcknowledge={jest.fn()} />)
    expect(screen.queryByTestId('view-record-acknowledge-button')).not.toBeInTheDocument()
  })

  it('hides Acknowledge button for unconfirmed results', () => {
    const unconfirmed = { ...RESULT, status: 'unconfirmed' as const }
    render(<ViewRecordModal result={unconfirmed} onClose={jest.fn()} onAcknowledge={jest.fn()} />)
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

  describe('conflict resolution', () => {
    it('shows per-field disk and catalog radio options for conflicting version', () => {
      render(<ViewRecordModal result={CONFLICTED_RESULT} onClose={jest.fn()} onSaveConflict={jest.fn()} />)
      expect(screen.getByTestId('conflict-version-disk')).toBeInTheDocument()
      expect(screen.getByTestId('conflict-version-catalog')).toBeInTheDocument()
    })

    it('shows per-field radios for all differing fields', () => {
      render(<ViewRecordModal result={CONFLICTED_ALL_FIELDS} onClose={jest.fn()} onSaveConflict={jest.fn()} />)
      expect(screen.getByTestId('conflict-name-disk')).toBeInTheDocument()
      expect(screen.getByTestId('conflict-name-catalog')).toBeInTheDocument()
      expect(screen.getByTestId('conflict-vendor-disk')).toBeInTheDocument()
      expect(screen.getByTestId('conflict-vendor-catalog')).toBeInTheDocument()
      expect(screen.getByTestId('conflict-version-disk')).toBeInTheDocument()
      expect(screen.getByTestId('conflict-version-catalog')).toBeInTheDocument()
    })

    it('defaults version to disk and name/vendor to catalog', () => {
      render(<ViewRecordModal result={CONFLICTED_ALL_FIELDS} onClose={jest.fn()} onSaveConflict={jest.fn()} />)
      expect((screen.getByTestId('conflict-version-disk') as HTMLInputElement).checked).toBe(true)
      expect((screen.getByTestId('conflict-version-catalog') as HTMLInputElement).checked).toBe(false)
      expect((screen.getByTestId('conflict-name-catalog') as HTMLInputElement).checked).toBe(true)
      expect((screen.getByTestId('conflict-vendor-catalog') as HTMLInputElement).checked).toBe(true)
    })

    it('shows Save button when onSaveConflict provided for conflicted result', () => {
      render(<ViewRecordModal result={CONFLICTED_RESULT} onClose={jest.fn()} onSaveConflict={jest.fn()} />)
      expect(screen.getByTestId('view-record-save-conflict-button')).toBeInTheDocument()
    })

    it('calls onSaveConflict with chosen values on Save', () => {
      const onSaveConflict = jest.fn()
      render(<ViewRecordModal result={CONFLICTED_RESULT} onClose={jest.fn()} onSaveConflict={onSaveConflict} />)
      fireEvent.click(screen.getByTestId('view-record-save-conflict-button'))
      expect(onSaveConflict).toHaveBeenCalledWith('r1', {
        name: 'Reverb Pro',
        vendor: 'Acme Audio',
        version: '1.0.0',
      })
    })

    it('calls onSaveConflict with catalog version when catalog radio selected', () => {
      const onSaveConflict = jest.fn()
      render(<ViewRecordModal result={CONFLICTED_RESULT} onClose={jest.fn()} onSaveConflict={onSaveConflict} />)
      fireEvent.click(screen.getByTestId('conflict-version-catalog'))
      fireEvent.click(screen.getByTestId('view-record-save-conflict-button'))
      expect(onSaveConflict).toHaveBeenCalledWith('r1', expect.objectContaining({ version: '2.0.0' }))
    })

    it('shows Save button for unconfirmed results with onSaveConflict', () => {
      const unconfirmed = { ...CONFLICTED_ALL_FIELDS, status: 'unconfirmed' as const }
      render(<ViewRecordModal result={unconfirmed} onClose={jest.fn()} onSaveConflict={jest.fn()} />)
      expect(screen.getByTestId('view-record-save-conflict-button')).toBeInTheDocument()
    })

    it('shows per-field radios for unconfirmed results with differing fields', () => {
      const unconfirmed = { ...CONFLICTED_ALL_FIELDS, status: 'unconfirmed' as const }
      render(<ViewRecordModal result={unconfirmed} onClose={jest.fn()} onSaveConflict={jest.fn()} />)
      expect(screen.getByTestId('conflict-name-disk')).toBeInTheDocument()
      expect(screen.getByTestId('conflict-vendor-disk')).toBeInTheDocument()
    })

    it('does not show Save button for non-conflicted results', () => {
      render(<ViewRecordModal result={MATCHED_RESULT} onClose={jest.fn()} onSaveConflict={jest.fn()} />)
      expect(screen.queryByTestId('view-record-save-conflict-button')).not.toBeInTheDocument()
    })
  })
})
