import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BackupRestorePage from '@/app/admin/backup/page'

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:mock')
  global.URL.revokeObjectURL = jest.fn()
})

function mockOk(extra: object = {}) {
  return { ok: true, json: () => Promise.resolve({}), ...extra }
}

function mockErr(detail: string) {
  return { ok: false, statusText: detail, json: () => Promise.resolve({ detail }) }
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
})
