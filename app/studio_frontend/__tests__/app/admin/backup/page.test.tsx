import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BackupRestorePage from '@/app/controlroom/admin/backup/page'

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:mock')
  global.URL.revokeObjectURL = jest.fn()
})

function mockOk(extra: object = {}) {
  return { ok: true, json: () => Promise.resolve({}), ...extra }
}

function mockErr(detail: string, status = 500) {
  return { ok: false, status, statusText: detail, json: () => Promise.resolve({ detail }) }
}

const verifyPassResult = {
  passed: true,
  created_at: '2026-03-17T12:00:00',
  tables: [
    { table: 'brands', rows_expected: 10, rows_actual: 10, hash_match: true, passed: true },
    { table: 'models', rows_expected: 5, rows_actual: 5, hash_match: true, passed: true },
  ],
}

const verifyFailResult = {
  passed: false,
  created_at: '2026-03-17T12:00:00',
  tables: [
    { table: 'brands', rows_expected: 10, rows_actual: 10, hash_match: true, passed: true },
    { table: 'models', rows_expected: 5, rows_actual: 3, hash_match: false, passed: false },
  ],
}

function selectVerifyFile() {
  const inputs = document.querySelectorAll('input[type="file"]')
  const verifyInput = inputs[1] as HTMLInputElement
  const file = new File(['sql'], 'backup.sql', { type: 'text/plain' })
  fireEvent.change(verifyInput, { target: { files: [file] } })
  return verifyInput
}

describe('BackupRestorePage', () => {
  beforeEach(() => mockFetch.mockReset())

  it('renders Backup and Restore sections with their action buttons', () => {
    render(<BackupRestorePage />)
    expect(screen.getByRole('button', { name: /download backup/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /restore database/i })).toBeInTheDocument()
  })

  it('restore button is disabled until a file is selected', () => {
    render(<BackupRestorePage />)
    expect(screen.getByRole('button', { name: /restore database/i })).toBeDisabled()
  })

  it('enables restore button when a file is selected', () => {
    render(<BackupRestorePage />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['sql'], 'backup.sql', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(screen.getByRole('button', { name: /restore database/i })).not.toBeDisabled()
  })

  it('shows success message after backup downloads', async () => {
    const mockClick = jest.fn()
    const origCreate = document.createElement.bind(document)
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'a') el.click = mockClick
      return el
    })

    mockFetch.mockResolvedValue(mockOk({
      headers: { get: () => 'attachment; filename=controlroomdb.sql' },
      blob: () => Promise.resolve(new Blob(['sql'])),
    }))

    render(<BackupRestorePage />)
    fireEvent.click(screen.getByRole('button', { name: /download backup/i }))
    await waitFor(() =>
      expect(screen.getByText(/downloaded controlroomdb\.sql/i)).toBeInTheDocument()
    )
    expect(mockClick).toHaveBeenCalled()
    jest.restoreAllMocks()
  })

  it('shows error message when backup fetch fails', async () => {
    mockFetch.mockResolvedValue(mockErr('Backup failed'))
    render(<BackupRestorePage />)
    fireEvent.click(screen.getByRole('button', { name: /download backup/i }))
    await waitFor(() => expect(screen.getByText('Backup failed')).toBeInTheDocument())
  })

  it('shows success message after restore completes', async () => {
    mockFetch.mockResolvedValue(mockOk())
    render(<BackupRestorePage />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['sql'], 'backup.sql', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /restore database/i }))
    await waitFor(() =>
      expect(screen.getByText(/database restored successfully/i)).toBeInTheDocument()
    )
  })

  it('shows error message when restore fetch fails', async () => {
    mockFetch.mockResolvedValue(mockErr('Invalid SQL file'))
    render(<BackupRestorePage />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['sql'], 'backup.sql', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /restore database/i }))
    await waitFor(() => expect(screen.getByText('Invalid SQL file')).toBeInTheDocument())
  })

  it('disables backup button while request is in progress', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    render(<BackupRestorePage />)
    fireEvent.click(screen.getByRole('button', { name: /download backup/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download backup/i })).toBeDisabled()
    )
  })

  // ---------------------------------------------------------------------------
  // Verify section
  // ---------------------------------------------------------------------------

  it('renders Verify section with disabled button when no file selected', () => {
    render(<BackupRestorePage />)
    expect(screen.getByRole('button', { name: /verify backup/i })).toBeDisabled()
  })

  it('enables verify button after file is selected', () => {
    render(<BackupRestorePage />)
    selectVerifyFile()
    expect(screen.getByRole('button', { name: /verify backup/i })).not.toBeDisabled()
  })

  it('disables verify button while request is in progress', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    render(<BackupRestorePage />)
    selectVerifyFile()
    fireEvent.click(screen.getByRole('button', { name: /verify backup/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /verify backup/i })).toBeDisabled()
    )
  })

  it('shows PASSED badge and results table on successful verify', async () => {
    mockFetch.mockResolvedValue(mockOk({ json: () => Promise.resolve(verifyPassResult) }))
    render(<BackupRestorePage />)
    selectVerifyFile()
    fireEvent.click(screen.getByRole('button', { name: /verify backup/i }))
    await waitFor(() => expect(screen.getByText('PASSED')).toBeInTheDocument())
    expect(screen.getByText('brands')).toBeInTheDocument()
    expect(screen.getByText('models')).toBeInTheDocument()
  })

  it('shows FAILED badge when verify finds mismatches', async () => {
    mockFetch.mockResolvedValue(mockOk({ json: () => Promise.resolve(verifyFailResult) }))
    render(<BackupRestorePage />)
    selectVerifyFile()
    fireEvent.click(screen.getByRole('button', { name: /verify backup/i }))
    await waitFor(() => expect(screen.getByText('FAILED')).toBeInTheDocument())
  })

  it('shows generic error message on 500 response', async () => {
    mockFetch.mockResolvedValue(mockErr('Internal server error', 500))
    render(<BackupRestorePage />)
    selectVerifyFile()
    fireEvent.click(screen.getByRole('button', { name: /verify backup/i }))
    await waitFor(() =>
      expect(screen.getByText('Internal server error')).toBeInTheDocument()
    )
  })

  it('shows re-download message when manifest is missing', async () => {
    mockFetch.mockResolvedValue(mockErr('No valid manifest found. Re-download a fresh backup to enable verification.', 400))
    render(<BackupRestorePage />)
    selectVerifyFile()
    fireEvent.click(screen.getByRole('button', { name: /verify backup/i }))
    await waitFor(() =>
      expect(screen.getByText(/re-download a fresh backup/i)).toBeInTheDocument()
    )
  })
})
