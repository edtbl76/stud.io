import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { UsersSidebar } from '@/components/layout/UsersSidebar'

const mockLogout = jest.fn().mockResolvedValue(undefined)
let mockPathname = '/studio/admin/users'

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ username: 'alice', role: 'admin', logout: mockLogout }),
}))

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

describe('UsersSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPathname = '/studio/admin/users'
  })

  it('renders the app name and module title', () => {
    render(<UsersSidebar />)
    expect(screen.getByText('STUD.io')).toBeInTheDocument()
    expect(screen.getByText('Studio Management')).toBeInTheDocument()
  })

  it('renders the logged-in username', () => {
    render(<UsersSidebar />)
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('renders the ADMIN group header', () => {
    render(<UsersSidebar />)
    expect(screen.getByRole('button', { name: /admin/i })).toBeInTheDocument()
  })

  it('renders a Users nav link pointing to /studio/admin/users when ADMIN is open', () => {
    render(<UsersSidebar />)
    const link = screen.getByRole('link', { name: /^users$/i })
    expect(link).toHaveAttribute('href', '/studio/admin/users')
  })

  it('applies active styles when pathname matches /studio/admin/users', () => {
    mockPathname = '/studio/admin/users'
    render(<UsersSidebar />)
    const link = screen.getByRole('link', { name: /^users$/i })
    expect(link.className).toContain('border-primary')
  })

  it('collapses and expands the ADMIN group on toggle', () => {
    render(<UsersSidebar />)
    const toggle = screen.getByRole('button', { name: /admin/i })
    fireEvent.click(toggle)
    expect(screen.queryByRole('link', { name: /^users$/i })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByRole('link', { name: /^users$/i })).toBeInTheDocument()
  })

  it('renders a Home link via ModuleSwitcher', () => {
    render(<UsersSidebar />)
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/')
  })

  it('calls logout when sign-out button is clicked and confirmed', () => {
    jest.spyOn(globalThis, 'confirm').mockReturnValue(true)
    render(<UsersSidebar />)
    fireEvent.click(screen.getByTitle('Sign out'))
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('does not call logout when sign-out is cancelled', () => {
    jest.spyOn(globalThis, 'confirm').mockReturnValue(false)
    render(<UsersSidebar />)
    fireEvent.click(screen.getByTitle('Sign out'))
    expect(mockLogout).not.toHaveBeenCalled()
  })
})
