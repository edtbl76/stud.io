import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ImportExportPage from '@/app/controlroom/admin/import-export/page'

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:mock')
  global.URL.revokeObjectURL = jest.fn()
})

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function mockXlsxResponse() {
  const blob = new Blob(['xlsx'], { type: XLSX_TYPE })
  return {
    ok: true,
    headers: { get: (h: string) => h === 'Content-Disposition' ? 'attachment; filename=export.xlsx' : null },
    blob: () => Promise.resolve(blob),
    json: () => Promise.resolve({}),
  }
}

function mockImportSuccess(creates = 1, updates = 0) {
  return {
    ok: true,
    json: () => Promise.resolve({
      summary: [{ sheet: 'Brands', creates, updates }],
      total_creates: creates,
      total_updates: updates,
    }),
  }
}

function mockImportError(errors: object[]) {
  return {
    ok: false,
    status: 422,
    statusText: 'Unprocessable Entity',
    json: () => Promise.resolve({ detail: { errors } }),
  }
}

function mockErr(detail: string, status = 400) {
  return { ok: false, status, statusText: detail, json: () => Promise.resolve({ detail }) }
}

function selectFile(name = 'test.xlsx') {
  const input = screen.getByRole('button', { name: /import/i })
    .closest('section')!
    .querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['xlsx'], name, { type: XLSX_TYPE })
  fireEvent.change(input, { target: { files: [file] } })
  return file
}

describe('ImportExportPage — layout', () => {
  it('renders Export Data and Download Template buttons', () => {
    render(<ImportExportPage />)
    expect(screen.getByRole('button', { name: /export data/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument()
  })

  it('renders Import button', () => {
    render(<ImportExportPage />)
    expect(screen.getByRole('button', { name: /^import$/i })).toBeInTheDocument()
  })

  it('renders all 11 table checkboxes', () => {
    render(<ImportExportPage />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(11)
  })

  it('all checkboxes are checked by default', () => {
    render(<ImportExportPage />)
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(checkboxes.every((cb) => cb.checked)).toBe(true)
  })

  it('Import button is disabled when no file is selected', () => {
    render(<ImportExportPage />)
    expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled()
  })
})

describe('ImportExportPage — table checklist', () => {
  it('Clear deselects all checkboxes', () => {
    render(<ImportExportPage />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(checkboxes.every((cb) => !cb.checked)).toBe(true)
  })

  it('Select all re-checks all after clearing', () => {
    render(<ImportExportPage />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    fireEvent.click(screen.getByRole('button', { name: /select all/i }))
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(checkboxes.every((cb) => cb.checked)).toBe(true)
  })

  it('clicking a checkbox toggles its state', () => {
    render(<ImportExportPage />)
    const effectsCb = screen.getByRole('checkbox', { name: /effects/i }) as HTMLInputElement
    fireEvent.click(effectsCb)
    expect(effectsCb.checked).toBe(false)
    fireEvent.click(effectsCb)
    expect(effectsCb.checked).toBe(true)
  })

  it('Export Data button is disabled when no tables are selected', () => {
    render(<ImportExportPage />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.getByRole('button', { name: /export data/i })).toBeDisabled()
  })
})

describe('ImportExportPage — export', () => {
  beforeEach(() => mockFetch.mockReset())

  it('calls the export endpoint with selected tables', async () => {
    mockFetch.mockResolvedValueOnce(mockXlsxResponse())
    render(<ImportExportPage />)
    fireEvent.click(screen.getByRole('button', { name: /export data/i }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    const url: string = mockFetch.mock.calls[0][0]
    expect(url).toContain('/api/admin/export/xlsx')
    expect(url).toContain('tables=')
  })

  it('shows success message with filename after export', async () => {
    mockFetch.mockResolvedValueOnce(mockXlsxResponse())
    render(<ImportExportPage />)
    fireEvent.click(screen.getByRole('button', { name: /export data/i }))
    await waitFor(() => expect(screen.getByText(/downloaded export\.xlsx/i)).toBeInTheDocument())
  })

  it('shows error message when export request fails', async () => {
    mockFetch.mockResolvedValueOnce(mockErr('Export failed'))
    render(<ImportExportPage />)
    fireEvent.click(screen.getByRole('button', { name: /export data/i }))
    await waitFor(() => expect(screen.getByText(/export failed/i)).toBeInTheDocument())
  })

  it('calls the template endpoint for Download Template', async () => {
    mockFetch.mockResolvedValueOnce(mockXlsxResponse())
    render(<ImportExportPage />)
    fireEvent.click(screen.getByRole('button', { name: /download template/i }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    const url: string = mockFetch.mock.calls[0][0]
    expect(url).toContain('/api/admin/export/template')
  })
})

describe('ImportExportPage — import', () => {
  beforeEach(() => mockFetch.mockReset())

  it('Import button becomes enabled when a file is selected', () => {
    render(<ImportExportPage />)
    selectFile()
    expect(screen.getByRole('button', { name: /^import$/i })).not.toBeDisabled()
  })

  it('shows success summary after successful import', async () => {
    mockFetch.mockResolvedValueOnce(mockImportSuccess(3, 1))
    render(<ImportExportPage />)
    selectFile()
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))
    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument())
    expect(screen.getByText(/3 created/i)).toBeInTheDocument()
    expect(screen.getByText(/1 updated/i)).toBeInTheDocument()
  })

  it('shows validation errors table on 422 response', async () => {
    mockFetch.mockResolvedValueOnce(mockImportError([
      { sheet: 'Effects', row: 2, column: 'Brand', value: 'BadBrand', message: "'BadBrand' not found" },
    ]))
    render(<ImportExportPage />)
    selectFile()
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))
    await waitFor(() => expect(screen.getByText(/1 validation error/i)).toBeInTheDocument())
    expect(screen.getByText("'BadBrand' not found")).toBeInTheDocument()
  })

  it('shows generic error message on non-422 failure', async () => {
    mockFetch.mockResolvedValueOnce(mockErr('File too large', 413))
    render(<ImportExportPage />)
    selectFile()
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))
    await waitFor(() => expect(screen.getByText(/file too large/i)).toBeInTheDocument())
  })

  it('clears prior results when a new file is selected', async () => {
    mockFetch.mockResolvedValueOnce(mockImportSuccess(1))
    render(<ImportExportPage />)
    selectFile()
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))
    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument())
    selectFile('second.xlsx')
    expect(screen.queryByText(/import complete/i)).not.toBeInTheDocument()
  })
})
