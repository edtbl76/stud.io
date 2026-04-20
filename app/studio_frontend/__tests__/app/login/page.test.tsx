import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from '@/app/login/page'

const mockLogin = jest.fn()

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ login: mockLogin, loginGoogle: jest.fn() }),
}))

jest.mock('next/script', () => ({
  __esModule: true,
  default: () => null,
}))

describe('LoginPage', () => {
  beforeEach(() => {
    mockLogin.mockReset()
  })

  it('renders username field, password field, and sign in button', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('calls login() with entered credentials on submit', async () => {
    mockLogin.mockResolvedValue(undefined)
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('alice', 'secret'))
  })

  it('shows error message when login fails', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'))
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument())
  })

  it('shows generic error message when login throws a non-Error', async () => {
    mockLogin.mockRejectedValue('oops')
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(screen.getByText('Login failed')).toBeInTheDocument())
  })

  // NOTE: initGoogle() and the Google login callback are not covered by tests.
  // Testing requires mocking the Google Identity Services API and the
  // NEXT_PUBLIC_GOOGLE_CLIENT_ID env var (a module-level constant requiring
  // jest.resetModules() to override). Deferred for now.

  it('disables submit button while login is in progress', async () => {
    mockLogin.mockImplementation(() => new Promise(() => {}))
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled()
    )
  })
})
