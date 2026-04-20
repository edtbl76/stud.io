import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '@/components/layout/Sidebar'

const mockLogout = jest.fn().mockResolvedValue(undefined)
const mockPush = jest.fn()

jest.mock('@/lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}))

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}))

let mockUseAuth = () => ({ username: 'alice', role: 'user', logout: mockLogout })
let mockPathname = '/controlroom/catalog/brands'

describe('Sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth = () => ({ username: 'alice', role: 'user', logout: mockLogout })
    mockPathname = '/controlroom/catalog/brands'
    mockPush.mockClear()
  })

  it('renders the app name and module title', () => {
    render(<Sidebar />)
    expect(screen.getByText('STUD.io')).toBeInTheDocument()
    expect(screen.getByText('ControlRoom')).toBeInTheDocument()
  })

  it('renders the logged-in username', () => {
    render(<Sidebar />)
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('calls logout when sign out button is clicked and confirmed', () => {
    globalThis.confirm = jest.fn(() => true)
    render(<Sidebar />)
    fireEvent.click(screen.getByTitle('Sign out'))
    expect(mockLogout).toHaveBeenCalled()
  })

  it('does not call logout when sign out is cancelled', () => {
    globalThis.confirm = jest.fn(() => false)
    render(<Sidebar />)
    fireEvent.click(screen.getByTitle('Sign out'))
    expect(mockLogout).not.toHaveBeenCalled()
  })

  it('shows nav group headers', () => {
    render(<Sidebar />)
    expect(screen.getByRole('button', { name: /CATALOG/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /SESSION/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /TOOLS/i })).toBeInTheDocument()
  })

  it('hides ADMIN group for non-admin users', () => {
    render(<Sidebar />)
    expect(screen.queryByRole('button', { name: /^ADMIN$/i })).not.toBeInTheDocument()
  })

  it('shows ADMIN group for admin users', () => {
    mockUseAuth = () => ({ username: 'admin', role: 'admin', logout: mockLogout })
    render(<Sidebar />)
    expect(screen.getByRole('button', { name: /^ADMIN$/i })).toBeInTheDocument()
  })

  it('expands a group when its header is clicked', () => {
    mockPathname = '/controlroom/session/effects'
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: /CATALOG/i }))
    expect(screen.getByRole('link', { name: 'Brands' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Models' })).toBeInTheDocument()
  })

  it('collapses an expanded group when its header is clicked again', () => {
    mockPathname = '/controlroom/session/effects'
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: /CATALOG/i }))
    expect(screen.getByRole('link', { name: 'Brands' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /CATALOG/i }))
    expect(screen.queryByRole('link', { name: 'Brands' })).not.toBeInTheDocument()
  })

  it('applies active link styling for the current path', () => {
    mockPathname = '/controlroom/catalog/brands'
    render(<Sidebar />)
    // CATALOG group auto-expands because /catalog/brands is the active path
    const brandsLink = screen.getByRole('link', { name: 'Brands' })
    expect(brandsLink.className).toContain('text-primary')
  })

  it('applies active link styling for a nested path under the item href', () => {
    mockPathname = '/controlroom/catalog/brands/details'
    render(<Sidebar />)
    // CATALOG group auto-expands; nested path matches via startsWith(href + '/')
    const brandsLink = screen.getByRole('link', { name: 'Brands' })
    expect(brandsLink.className).toContain('text-primary')
  })

  it('does not apply active link styling when path does not match', () => {
    mockPathname = '/unrelated'
    render(<Sidebar />)
    // CATALOG is collapsed; open it to inspect the Brands link class
    fireEvent.click(screen.getByRole('button', { name: /CATALOG/i }))
    const brandsLink = screen.getByRole('link', { name: 'Brands' })
    expect(brandsLink.className).not.toContain('text-primary')
  })

  it('renders Stats link in the ADMIN group', () => {
    mockUseAuth = () => ({ username: 'admin', role: 'admin', logout: mockLogout })
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: /^ADMIN$/i }))
    expect(screen.getByRole('link', { name: /^stats$/i })).toBeInTheDocument()
  })

  it('renders Change Review link in the ADMIN group', () => {
    mockUseAuth = () => ({ username: 'admin', role: 'admin', logout: mockLogout })
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: /^ADMIN$/i }))
    expect(screen.getByRole('link', { name: /^change review$/i })).toBeInTheDocument()
  })

  it('renders the global search input', () => {
    render(<Sidebar />)
    expect(screen.getByPlaceholderText('Global search...')).toBeInTheDocument()
  })

  it('navigates to /search when a query of 2+ chars is submitted', () => {
    render(<Sidebar />)
    const input = screen.getByPlaceholderText('Global search...')
    fireEvent.change(input, { target: { value: 'reverb' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockPush).toHaveBeenCalledWith('/controlroom/search?q=reverb')
  })

  it('does not navigate when query is shorter than 2 characters', () => {
    render(<Sidebar />)
    const input = screen.getByPlaceholderText('Global search...')
    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('renders ADMIN group items in alphabetical order', () => {
    mockUseAuth = () => ({ username: 'admin', role: 'admin', logout: mockLogout })
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: /^ADMIN$/i }))
    const adminLinks = screen
      .getAllByRole('link')
      .filter((l) => (l.getAttribute('href') ?? '').startsWith('/controlroom/admin/'))
    const labels = adminLinks.map((l) => l.textContent)
    expect(labels).toEqual(['Backup & Restore', 'Change Review', 'Import / Export', 'Stats'])
  })
})
