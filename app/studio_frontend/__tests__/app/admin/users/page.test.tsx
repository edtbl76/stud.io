import * as React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import UsersPage from '@/app/admin/users/page'

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ username: 'admin' }),
}))

jest.mock('next/script', () => ({
  __esModule: true,
  default: () => null,
}))

const mockUsers = [
  {
    user_id: '1',
    username: 'admin',
    role: 'admin',
    google_linked: false,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    user_id: '2',
    username: 'alice',
    role: 'user',
    google_linked: false,
    created_at: '2024-01-02T00:00:00Z',
  },
]

const mockFetch = jest.fn()
global.fetch = mockFetch

function ok(data: unknown = {}) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
}

function err(detail: string) {
  return Promise.resolve({ ok: false, statusText: detail, json: () => Promise.resolve({ detail }) })
}

describe('UsersPage', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockUsers) })
  })

  it('shows loading indicator then renders user list', async () => {
    render(<UsersPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument())
    expect(screen.getAllByText('admin').length).toBeGreaterThan(0)
  })

  it('marks the current user with (you)', async () => {
    render(<UsersPage />)
    await waitFor(() => screen.getByText('alice'))
    expect(screen.getByText('(you)')).toBeInTheDocument()
  })

  it('disables delete and role buttons for the current user', async () => {
    render(<UsersPage />)
    await waitFor(() => screen.getByText('alice'))
    const rows = screen.getAllByRole('row')
    const adminRow = rows.find(r => within(r).queryByText('(you)'))!
    expect(within(adminRow).getByTitle('Delete user')).toBeDisabled()
    expect(within(adminRow).getByTitle(/switch to/i)).toBeDisabled()
  })

  it('creates a new user and shows success message', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUsers) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUsers) })

    render(<UsersPage />)
    await waitFor(() => screen.getByText('alice'))

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'bob' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass123' } })
    fireEvent.click(screen.getByRole('button', { name: /add user/i }))

    await waitFor(() =>
      expect(screen.getByText(/user "bob" created/i)).toBeInTheDocument()
    )
  })

  it('shows error when user creation fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUsers) })
      .mockResolvedValueOnce(err('Username already exists'))

    render(<UsersPage />)
    await waitFor(() => screen.getByText('alice'))

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: /add user/i }))

    await waitFor(() =>
      expect(screen.getByText('Username already exists')).toBeInTheDocument()
    )
  })

  it('deletes a non-current user and shows success message', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUsers) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(null) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([mockUsers[0]]) } as unknown as Response)

    render(<UsersPage />)
    await waitFor(() => screen.getByText('alice'))

    const rows = screen.getAllByRole('row')
    const aliceRow = rows.find(r => within(r).queryByText('alice') && !within(r).queryByText('(you)'))!
    fireEvent.click(within(aliceRow).getByTitle('Delete user'))

    await waitFor(() =>
      expect(screen.getByText(/user "alice" deleted/i)).toBeInTheDocument()
    )
  })

  it('toggles a user role and shows success message', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUsers) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUsers) })

    render(<UsersPage />)
    await waitFor(() => screen.getByText('alice'))

    const rows = screen.getAllByRole('row')
    const aliceRow = rows.find(r => within(r).queryByText('alice'))!
    fireEvent.click(within(aliceRow).getByTitle(/switch to admin/i))

    await waitFor(() =>
      expect(screen.getByText(/alice is now admin/i)).toBeInTheDocument()
    )
  })

  it('opens inline password form and submits successfully', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUsers) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) } as unknown as Response)

    render(<UsersPage />)
    await waitFor(() => screen.getByText('alice'))

    const rows = screen.getAllByRole('row')
    const aliceRow = rows.find(r => within(r).queryByText('alice') && !within(r).queryByText('(you)'))!
    fireEvent.click(within(aliceRow).getByTitle('Change password'))

    const pwInput = screen.getByPlaceholderText(/new password/i)
    fireEvent.change(pwInput, { target: { value: 'newpass' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(screen.getByText(/password updated/i)).toBeInTheDocument()
    )
  })

  it('shows error when password change fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUsers) })
      .mockResolvedValueOnce(err('Password too short'))

    render(<UsersPage />)
    await waitFor(() => screen.getByText('alice'))

    const rows = screen.getAllByRole('row')
    const aliceRow = rows.find(r => within(r).queryByText('alice') && !within(r).queryByText('(you)'))!
    fireEvent.click(within(aliceRow).getByTitle('Change password'))

    const pwInput = screen.getByPlaceholderText(/new password/i)
    fireEvent.change(pwInput, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(screen.getByText('Password too short')).toBeInTheDocument()
    )
  })

  it('closes password form when cancel is clicked', async () => {
    render(<UsersPage />)
    await waitFor(() => screen.getByText('alice'))

    const rows = screen.getAllByRole('row')
    const aliceRow = rows.find(r => within(r).queryByText('alice') && !within(r).queryByText('(you)'))!
    fireEvent.click(within(aliceRow).getByTitle('Change password'))
    expect(screen.getByPlaceholderText(/new password/i)).toBeInTheDocument()

    // X button closes the form
    const cancelBtn = screen.getByRole('button', { name: '' }) // X icon button
    // Find it by querying within the expanded row
    const allRows = screen.getAllByRole('row')
    const expandedRow = allRows.find(r => within(r).queryByPlaceholderText(/new password/i))!
    const xBtn = within(expandedRow).getAllByRole('button').find(b => !b.textContent?.trim())!
    fireEvent.click(xBtn)

    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/new password/i)).not.toBeInTheDocument()
    )
  })

  it('shows error when role toggle fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUsers) })
      .mockResolvedValueOnce(err('Permission denied'))

    render(<UsersPage />)
    await waitFor(() => screen.getByText('alice'))

    const rows = screen.getAllByRole('row')
    const aliceRow = rows.find(r => within(r).queryByText('alice'))!
    fireEvent.click(within(aliceRow).getByTitle(/switch to admin/i))

    await waitFor(() =>
      expect(screen.getByText('Permission denied')).toBeInTheDocument()
    )
  })

  it('shows error when delete fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUsers) })
      .mockResolvedValueOnce(err('Cannot delete last admin'))

    render(<UsersPage />)
    await waitFor(() => screen.getByText('alice'))

    const rows = screen.getAllByRole('row')
    const aliceRow = rows.find(r => within(r).queryByText('alice') && !within(r).queryByText('(you)'))!
    fireEvent.click(within(aliceRow).getByTitle('Delete user'))

    await waitFor(() =>
      expect(screen.getByText('Cannot delete last admin')).toBeInTheDocument()
    )
  })

  it('dismisses status message when X is clicked', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUsers) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUsers) })

    render(<UsersPage />)
    await waitFor(() => screen.getByText('alice'))

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'bob' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: /add user/i }))

    await waitFor(() => expect(screen.getByText(/user "bob" created/i)).toBeInTheDocument())

    const statusDiv = screen.getByText(/user "bob" created/i).closest('div')!
    fireEvent.click(within(statusDiv).getByRole('button'))

    await waitFor(() =>
      expect(screen.queryByText(/user "bob" created/i)).not.toBeInTheDocument()
    )
  })

  // NOTE: Google SSO-related code (_handleLinkResponse, initGoogle, handleLinkGoogle)
  // is not covered by tests. Testing requires mocking the Google Identity Services API
  // (globalThis.window.google.accounts.id.*) and the NEXT_PUBLIC_GOOGLE_CLIENT_ID env var,
  // which requires jest.resetModules() due to the module-level constant. Deferred for now.
})
