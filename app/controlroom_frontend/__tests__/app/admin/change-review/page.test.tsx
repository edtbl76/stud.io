import * as React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import ChangeReviewPage from '@/app/admin/change-review/page'

jest.mock('@/lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}))

let mockUseAuth = () => ({ username: 'admin', role: 'admin' })

const mockFetch = jest.fn()
global.fetch = mockFetch

const mockEntry = {
  audit_id: 'aaaaaaaa-0000-0000-0000-000000000001',
  table_name: 'effects',
  record_id: 'bbbbbbbb-0000-0000-0000-000000000001',
  operation: 'DELETE',
  performed_by: 'admin',
  performed_at: '2026-03-18T14:00:00Z',
  acknowledged_at: null,
  acknowledged_by: null,
  undone_at: null,
  undone_by: null,
  record_display_name: null,
}

const mockUpdateEntry = {
  ...mockEntry,
  audit_id: 'aaaaaaaa-0000-0000-0000-000000000002',
  operation: 'UPDATE',
}

const mockResponse = {
  total: 2,
  page: 1,
  page_size: 50,
  entries: [mockEntry, mockUpdateEntry],
}

function ok(data: unknown = {}) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data), status: 200 })
}

function err(detail: string, status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ detail }),
  })
}

describe('ChangeReviewPage', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockUseAuth = () => ({ username: 'admin', role: 'admin' })
    mockFetch.mockResolvedValue(ok(mockResponse))
  })

  it('renders the page heading', async () => {
    render(<ChangeReviewPage />)
    await waitFor(() => expect(screen.getByText('Change Review')).toBeInTheDocument())
  })

  it('renders filter dropdowns', async () => {
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getByText('Change Review'))
    expect(screen.getByRole('combobox', { name: /table/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /operation/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /status/i })).toBeInTheDocument()
  })

  it('renders entries from the API', async () => {
    render(<ChangeReviewPage />)
    await waitFor(() => expect(screen.getAllByText('effects').length).toBeGreaterThan(0))
    expect(screen.getByText('DELETE')).toBeInTheDocument()
  })

  it('shows Loader2 spinner while loading', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    render(<ChangeReviewPage />)
    expect(document.querySelector('.lucide-loader-circle')).toBeInTheDocument()
  })

  it('shows error state on API failure', async () => {
    mockFetch.mockResolvedValue(err('Internal Server Error'))
    render(<ChangeReviewPage />)
    await waitFor(() =>
      expect(screen.getByText(/could not load/i)).toBeInTheDocument()
    )
  })

  it('shows Undo and Acknowledge buttons for admin users on pending entries', async () => {
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))
    expect(screen.getAllByRole('button', { name: /undo/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /acknowledge/i }).length).toBeGreaterThan(0)
  })

  it('shows Permanently Delete button for DELETE pending entries', async () => {
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))
    expect(
      screen.getAllByRole('button', { name: /permanently delete/i }).length
    ).toBeGreaterThan(0)
  })

  it('hides action buttons for non-admin users', async () => {
    mockUseAuth = () => ({ username: 'bob', role: 'user' })
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument()
  })

  it('DELETE entries show Permanently Delete but not Acknowledge', async () => {
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))
    // There is exactly one DELETE entry — it should have Permanently Delete, not Acknowledge
    expect(screen.getAllByRole('button', { name: /permanently delete/i })).toHaveLength(1)
    // UPDATE entry has Acknowledge; DELETE entry does not — total should be 1
    expect(screen.getAllByRole('button', { name: /acknowledge/i })).toHaveLength(1)
  })

  it('clicking Acknowledge calls the correct endpoint and removes entry', async () => {
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))

    // Acknowledge is only on the UPDATE entry (mockUpdateEntry), not the DELETE entry
    const ackButtons = screen.getAllByRole('button', { name: /acknowledge/i })
    mockFetch.mockResolvedValueOnce(ok({ ...mockUpdateEntry, acknowledged_at: '2026-03-18T14:01:00Z', acknowledged_by: 'admin' }))

    fireEvent.click(ackButtons[0])
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/admin/change-review/${mockUpdateEntry.audit_id}/acknowledge`),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('clicking Undo calls the undo endpoint', async () => {
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))

    const undoButtons = screen.getAllByRole('button', { name: /undo/i })
    mockFetch.mockResolvedValueOnce(ok({ ...mockEntry, undone_at: '2026-03-18T14:01:00Z', undone_by: 'admin' }))

    fireEvent.click(undoButtons[0])
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/admin/change-review/${mockEntry.audit_id}/undo`),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('clicking Permanently Delete calls the permanent endpoint', async () => {
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))

    const permButtons = screen.getAllByRole('button', { name: /permanently delete/i })
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) })

    fireEvent.click(permButtons[0])
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/admin/change-review/${mockEntry.audit_id}/permanent`),
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  it('shows inline error on 409 with detail message', async () => {
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))

    const ackButtons = screen.getAllByRole('button', { name: /acknowledge/i })
    mockFetch.mockResolvedValueOnce(
      err('Entry is already acknowledged', 409)
    )

    fireEvent.click(ackButtons[0])
    await waitFor(() =>
      expect(screen.getByText(/Entry is already acknowledged/i)).toBeInTheDocument()
    )
  })

  it('clicking a row fetches the detail endpoint and shows the diff modal', async () => {
    const detailEntry = {
      ...mockUpdateEntry,
      old_data: { effect_name: 'Reverb', version: '1.0' },
      new_data: { effect_name: 'Reverb', version: '2.0' },
    }
    // First call: list; second call: detail on row click
    mockFetch
      .mockResolvedValueOnce(ok(mockResponse))
      .mockResolvedValueOnce(ok(detailEntry))

    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))

    const rows = document.querySelectorAll('tbody tr')
    fireEvent.click(rows[1]) // second row = UPDATE entry

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/admin/change-review/${mockUpdateEntry.audit_id}`)
      )
      expect(screen.getByText('Before')).toBeInTheDocument()
      expect(screen.getByText('After')).toBeInTheDocument()
    })
  })

  it('diff modal can be closed', async () => {
    const detailEntry = {
      ...mockUpdateEntry,
      old_data: { effect_name: 'Reverb', version: '1.0' },
      new_data: { effect_name: 'Reverb', version: '2.0' },
    }
    mockFetch
      .mockResolvedValueOnce(ok(mockResponse))
      .mockResolvedValueOnce(ok(detailEntry))

    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))

    const rows = document.querySelectorAll('tbody tr')
    fireEvent.click(rows[1])

    await waitFor(() => expect(screen.getByText('Before')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Close' })) // Radix dialog close button
    await waitFor(() => expect(screen.queryByText('Before')).not.toBeInTheDocument())
  })

  it('auto-navigates to previous page when current page entries are all removed', async () => {
    const page2Response = {
      total: 51,
      page: 2,
      page_size: 50,
      entries: [mockEntry],
    }
    const emptyPage2 = { total: 50, page: 2, page_size: 50, entries: [] }
    const page1Response = { total: 50, page: 1, page_size: 50, entries: [mockUpdateEntry] }

    mockFetch
      .mockResolvedValueOnce(ok(page2Response))   // initial load (page 1 in test, but sets up state)
      .mockResolvedValueOnce(ok({ ...mockEntry, undone_at: '2026-03-18T14:01:00Z' })) // undo action
      .mockResolvedValueOnce(ok(page1Response))   // re-fetch on page decrease

    render(<ChangeReviewPage />)
    await waitFor(() => screen.getByText('DELETE'))

    const undoButtons = screen.getAllByRole('button', { name: /undo/i })
    fireEvent.click(undoButtons[0])

    await waitFor(() => {
      // After removing the only entry, the page effect fires and fetches page 1
      expect(screen.queryByText('DELETE')).not.toBeInTheDocument()
    })
  })

  it('refetches the list after a successful action', async () => {
    const refreshedResponse = { total: 1, page: 1, page_size: 50, entries: [mockEntry] }
    mockFetch
      .mockResolvedValueOnce(ok(mockResponse))
      .mockResolvedValueOnce(ok({ ...mockUpdateEntry, acknowledged_at: '2026-03-18T14:01:00Z', acknowledged_by: 'admin' }))
      .mockResolvedValueOnce(ok(refreshedResponse))

    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))

    const ackButtons = screen.getAllByRole('button', { name: /acknowledge/i })
    fireEvent.click(ackButtons[0])

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3))
    // Refetch must reuse the exact same URL as the initial load — same path and query params
    expect(mockFetch.mock.calls[2][0]).toBe(mockFetch.mock.calls[0][0])
  })

  it('refetches the list after a 204 action (permanently delete)', async () => {
    const refreshedResponse = { total: 1, page: 1, page_size: 50, entries: [mockUpdateEntry] }
    mockFetch
      .mockResolvedValueOnce(ok(mockResponse))
      .mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce(ok(refreshedResponse))

    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))

    const permButtons = screen.getAllByRole('button', { name: /permanently delete/i })
    fireEvent.click(permButtons[0])

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3))
    // Refetch must reuse the exact same URL as the initial load — same path and query params
    expect(mockFetch.mock.calls[2][0]).toBe(mockFetch.mock.calls[0][0])
  })

  it('keeps list visible and shows inline error when background refresh fails', async () => {
    mockFetch
      .mockResolvedValueOnce(ok(mockResponse))
      .mockResolvedValueOnce(ok({ ...mockUpdateEntry, acknowledged_at: '2026-03-18T14:01:00Z', acknowledged_by: 'admin' }))
      .mockResolvedValueOnce(err('Service unavailable', 503))

    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))

    const ackButtons = screen.getAllByRole('button', { name: /acknowledge/i })
    fireEvent.click(ackButtons[0])

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3))
    // Full-page error state must NOT be shown
    expect(screen.queryByText(/could not load change review/i)).not.toBeInTheDocument()
    // Inline refresh error banner must be shown
    expect(screen.getByText(/could not refresh/i)).toBeInTheDocument()
    // Table and its data rows must still be visible — not wiped by the failed refresh
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(0)
    expect(screen.getByText('DELETE')).toBeInTheDocument()
  })

  it('clears refresh error banner when a hard reload is triggered', async () => {
    const reloadResponse = { total: 1, page: 1, page_size: 50, entries: [mockEntry] }
    mockFetch
      .mockResolvedValueOnce(ok(mockResponse))                                           // initial load
      .mockResolvedValueOnce(ok({ ...mockUpdateEntry, acknowledged_at: '2026-03-18T14:01:00Z', acknowledged_by: 'admin' })) // action
      .mockResolvedValueOnce(err('Service unavailable', 503))                            // background refresh fails
      .mockResolvedValueOnce(ok(reloadResponse))                                         // hard reload after filter change

    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))

    fireEvent.click(screen.getAllByRole('button', { name: /acknowledge/i })[0])
    await waitFor(() => expect(screen.getByText(/could not refresh/i)).toBeInTheDocument())

    // Change a filter to trigger a hard reload
    fireEvent.change(screen.getByRole('combobox', { name: /status/i }), { target: { value: 'acknowledged' } })

    await waitFor(() => expect(screen.queryByText(/could not refresh/i)).not.toBeInTheDocument())
  })

  it('shows badge instead of buttons for already-resolved entries', async () => {
    const resolvedEntry = { ...mockEntry, acknowledged_at: '2026-03-18T14:00:00Z', acknowledged_by: 'admin' }
    mockFetch.mockResolvedValue(ok({ total: 1, page: 1, page_size: 50, entries: [resolvedEntry] }))
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument()
    expect(screen.getByText(/acknowledged/i)).toBeInTheDocument()
  })

  it('renders pagination controls', async () => {
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getByText('Change Review'))
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  it('entry rows are keyboard-focusable with tabIndex=0', async () => {
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))
    const rows = document.querySelectorAll('tbody tr')
    expect(rows.length).toBe(2)
    rows.forEach((row) => {
      expect(row).toHaveAttribute('tabindex', '0')
    })
  })

  it('entry rows have an accessible aria-label', async () => {
    const entryWithName = { ...mockEntry, record_display_name: 'Big Reverb' }
    mockFetch.mockResolvedValue(ok({ total: 1, page: 1, page_size: 50, entries: [entryWithName] }))
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))
    const rows = document.querySelectorAll('tbody tr')
    expect(rows[0]).toHaveAttribute('aria-label', 'View details for Big Reverb')
  })

  it('pressing Enter on a row triggers the detail fetch', async () => {
    const detailEntry = {
      ...mockUpdateEntry,
      old_data: { effect_name: 'Reverb', version: '1.0' },
      new_data: { effect_name: 'Reverb', version: '2.0' },
    }
    mockFetch
      .mockResolvedValueOnce(ok(mockResponse))
      .mockResolvedValueOnce(ok(detailEntry))

    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))

    const rows = document.querySelectorAll('tbody tr')
    fireEvent.keyDown(rows[1], { key: 'Enter' })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/admin/change-review/${mockUpdateEntry.audit_id}`)
      )
    })
  })

  it('pressing Space on a row triggers the detail fetch', async () => {
    const detailEntry = {
      ...mockUpdateEntry,
      old_data: { effect_name: 'Reverb', version: '1.0' },
      new_data: { effect_name: 'Reverb', version: '2.0' },
    }
    mockFetch
      .mockResolvedValueOnce(ok(mockResponse))
      .mockResolvedValueOnce(ok(detailEntry))

    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))

    const rows = document.querySelectorAll('tbody tr')
    fireEvent.keyDown(rows[1], { key: ' ' })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/admin/change-review/${mockUpdateEntry.audit_id}`)
      )
    })
  })

  it('pressing other keys on a row does not trigger the detail fetch', async () => {
    render(<ChangeReviewPage />)
    await waitFor(() => screen.getAllByText('effects'))

    const initialCallCount = mockFetch.mock.calls.length
    const rows = document.querySelectorAll('tbody tr')
    fireEvent.keyDown(rows[0], { key: 'Tab' })

    expect(mockFetch.mock.calls.length).toBe(initialCallCount)
  })
})
