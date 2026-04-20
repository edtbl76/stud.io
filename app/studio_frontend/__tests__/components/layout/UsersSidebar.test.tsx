import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { UsersSidebar } from '@/components/layout/UsersSidebar'

const mockLogout = jest.fn()
let mockPathname = '/users'

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ username: 'alice', logout: mockLogout }),
}))

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

describe('UsersSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPathname = '/users'
  })

  it('renders the app name and module title', () => {
    render(<UsersSidebar />)
    expect(screen.getByText('STUD.io')).toBeInTheDocument()
    expect(screen.getByText('User Management')).toBeInTheDocument()
  })

  it('renders the logged-in username', () => {
    render(<UsersSidebar />)
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('renders a Users nav link pointing to /users', () => {
    render(<UsersSidebar />)
    const link = screen.getByRole('link', { name: /users/i })
    expect(link).toHaveAttribute('href', '/users')
  })

  it('renders a Home link at the bottom', () => {
    render(<UsersSidebar />)
    const homeLink = screen.getByRole('link', { name: /home/i })
    expect(homeLink).toHaveAttribute('href', '/')
  })

  it('applies active styles when pathname matches /users', () => {
    mockPathname = '/users'
    render(<UsersSidebar />)
    const link = screen.getByRole('link', { name: /users/i })
    expect(link.className).toContain('border-primary')
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
