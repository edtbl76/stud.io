import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RecordHistoryView } from '@/components/RecordHistoryView'

jest.mock('@/lib/api', () => ({
  api: {
    list: jest.fn(),
    create: jest.fn(),
  },
}))
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ role: 'admin' }) }))

import { api } from '@/lib/api'
const mockApi = api as jest.Mocked<typeof api>

const makeEntry = (overrides: Partial<{
  audit_id: string
  operation: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  undone_at: string | null
  acknowledged_at: string | null
}> = {}) => ({
  audit_id: 'audit-uuid-1',
  table_name: 'effects',
  record_id: 'rec-uuid-1',
  operation: 'UPDATE',
  performed_by: 'admin',
  performed_at: '2026-03-18T14:22:00Z',
  old_data: { effect_name: 'Old' },
  new_data: { effect_name: 'New' },
  acknowledged_at: null,
  acknowledged_by: null,
  undone_at: null,
  undone_by: null,
  ...overrides,
})

function renderView(props: Partial<React.ComponentProps<typeof RecordHistoryView>> = {}) {
  return render(
    <RecordHistoryView
      historyUrl="/effects/some-id/history"
      isAdmin={true}
      onUndo={jest.fn()}
      {...props}
    />
  )
}

describe('RecordHistoryView — loading / empty', () => {
  it('shows spinner while loading', () => {
    mockApi.list.mockReturnValue(new Promise(() => {}))
    renderView()
    expect(screen.getByText(/loading history/i)).toBeInTheDocument()
  })

  it('shows error message on fetch failure', async () => {
    mockApi.list.mockRejectedValue(new Error('Network error'))
    renderView()
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument())
  })

  it('shows "No history available" for empty list', async () => {
    mockApi.list.mockResolvedValue([])
    renderView()
    await waitFor(() => expect(screen.getByText('No history available')).toBeInTheDocument())
  })
})

describe('RecordHistoryView — entries', () => {
  it('renders entries from mocked API response', async () => {
    mockApi.list.mockResolvedValue([makeEntry()])
    renderView()
    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument())
    expect(screen.getByText('UPDATE')).toBeInTheDocument()
  })

  it('shows "Record created" for CREATE entries', async () => {
    mockApi.list.mockResolvedValue([makeEntry({ operation: 'CREATE', old_data: null, new_data: { effect_name: 'New' } })])
    renderView()
    await waitFor(() => expect(screen.getByText('Record created')).toBeInTheDocument())
  })

  it('shows "Record deleted" for DELETE entries', async () => {
    mockApi.list.mockResolvedValue([makeEntry({ operation: 'DELETE', old_data: { effect_name: 'Old' }, new_data: null })])
    renderView()
    await waitFor(() => expect(screen.getByText('Record deleted')).toBeInTheDocument())
  })

  it('shows diff for UPDATE entries', async () => {
    mockApi.list.mockResolvedValue([makeEntry({
      operation: 'UPDATE',
      old_data: { effect_name: 'Old' },
      new_data: { effect_name: 'New' },
    })])
    renderView()
    await waitFor(() => expect(screen.getByText('effect_name')).toBeInTheDocument())
    expect(screen.getByText('Old')).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('truncates UUID values in diff output to 8 characters', async () => {
    const uuid = '12345678-abcd-ef00-1234-567890abcdef'
    mockApi.list.mockResolvedValue([makeEntry({
      old_data: { brand_id: uuid },
      new_data: { brand_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    })])
    renderView()
    await waitFor(() => expect(screen.getByText('12345678')).toBeInTheDocument())
    expect(screen.queryByText(uuid)).not.toBeInTheDocument()
  })

  it('renders non-UUID strings in full', async () => {
    mockApi.list.mockResolvedValue([makeEntry({
      old_data: { effect_name: 'Short Name' },
      new_data: { effect_name: 'New Name' },
    })])
    renderView()
    await waitFor(() => expect(screen.getByText('Short Name')).toBeInTheDocument())
  })
})

describe('RecordHistoryView — undo', () => {
  it('shows Undo button when isAdmin=true and entry is undoable', async () => {
    mockApi.list.mockResolvedValue([makeEntry()])
    renderView({ isAdmin: true })
    await waitFor(() => expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument())
  })

  it('hides Undo button when isAdmin=false', async () => {
    mockApi.list.mockResolvedValue([makeEntry()])
    renderView({ isAdmin: false })
    await waitFor(() => expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument())
  })

  it('hides Undo button for already-undone entries', async () => {
    mockApi.list.mockResolvedValue([makeEntry({ undone_at: '2026-03-19T10:00:00Z' })])
    renderView()
    await waitFor(() => expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument())
    expect(screen.getByText('Undone')).toBeInTheDocument()
  })

  it('hides Undo button for acknowledged entries', async () => {
    mockApi.list.mockResolvedValue([makeEntry({ acknowledged_at: '2026-03-19T10:00:00Z' })])
    renderView()
    await waitFor(() => expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument())
    expect(screen.getByText('Acknowledged')).toBeInTheDocument()
  })

  it('calls POST undo endpoint and invokes onUndo on success', async () => {
    mockApi.list.mockResolvedValue([makeEntry({ audit_id: 'audit-uuid-1' })])
    mockApi.create.mockResolvedValue({})
    const onUndo = jest.fn()
    renderView({ onUndo })
    await waitFor(() => screen.getByRole('button', { name: /undo/i }))
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    await waitFor(() => expect(mockApi.create).toHaveBeenCalledWith('/admin/change-review/audit-uuid-1/undo', {}))
    expect(onUndo).toHaveBeenCalled()
  })
})
