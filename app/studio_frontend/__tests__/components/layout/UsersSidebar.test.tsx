import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { UsersSidebar } from '@/components/layout/UsersSidebar'

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ prefetchInfiniteQuery: jest.fn(), prefetchQuery: jest.fn() }),
}))

jest.mock('@/lib/api', () => ({ api: { listPaged: jest.fn(), list: jest.fn() } }))

const mockLogout = jest.fn().mockResolvedValue(undefined)
let mockPathname = '/studio/admin/users'
let mockUseAuth = () => ({ username: 'alice', role: 'admin', logout: mockLogout })

jest.mock('@/lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}))

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

describe('UsersSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPathname = '/studio/admin/users'
    mockUseAuth = () => ({ username: 'alice', role: 'admin', logout: mockLogout })
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

  it('renders the CATALOG group header', () => {
    render(<UsersSidebar />)
    expect(screen.getByRole('button', { name: /^catalog$/i })).toBeInTheDocument()
  })

  it('renders the CONFIG group header', () => {
    render(<UsersSidebar />)
    expect(screen.getByRole('button', { name: /^config$/i })).toBeInTheDocument()
  })

  it('renders the ADMIN group header', () => {
    render(<UsersSidebar />)
    expect(screen.getByRole('button', { name: /^admin$/i })).toBeInTheDocument()
  })

  it.each([
    ['Brands', '/studio/catalog/brands'],
    ['Models', '/studio/catalog/models'],
  ])('renders %s nav link pointing to %s', (label, href) => {
    mockPathname = '/studio/catalog/brands'
    render(<UsersSidebar />)
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href)
  })

  it.each([
    ['Effect Types',     '/studio/config/effect-types'],
    ['Entity Types',     '/studio/config/entity-types'],
    ['Instrument Types', '/studio/config/instrument-types'],
    ['Model Types',      '/studio/config/model-types'],
    ['Plugin Formats',   '/studio/config/plugin-formats'],
    ['Tag Types',        '/studio/config/tag-types'],
    ['Tool Types',       '/studio/config/tool-types'],
  ])('renders %s nav link pointing to %s', (label, href) => {
    mockPathname = '/studio/config/effect-types'
    render(<UsersSidebar />)
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href)
  })

  it.each([
    ['Backup & Restore', '/studio/admin/backup'],
    ['Change Review',    '/studio/admin/change-review'],
    ['Import / Export',  '/studio/admin/import-export'],
    ['Stats',            '/studio/admin/stats'],
    ['Users',            '/studio/admin/users'],
  ])('renders %s nav link pointing to %s', (label, href) => {
    render(<UsersSidebar />)
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href)
  })

  it('applies active styles when pathname matches /studio/config/effect-types', () => {
    mockPathname = '/studio/config/effect-types'
    render(<UsersSidebar />)
    expect(screen.getByRole('link', { name: 'Effect Types' }).className).toContain('border-primary')
  })

  it('collapses and expands the CONFIG group on toggle', () => {
    mockPathname = '/studio/config/effect-types'
    render(<UsersSidebar />)
    const toggle = screen.getByRole('button', { name: /^config$/i })
    fireEvent.click(toggle)
    expect(screen.queryByRole('link', { name: 'Effect Types' })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByRole('link', { name: 'Effect Types' })).toBeInTheDocument()
  })

  it('applies active styles when pathname matches /studio/catalog/brands', () => {
    mockPathname = '/studio/catalog/brands'
    render(<UsersSidebar />)
    expect(screen.getByRole('link', { name: 'Brands' }).className).toContain('border-primary')
  })

  it('applies active styles when pathname matches /studio/admin/users', () => {
    mockPathname = '/studio/admin/users'
    render(<UsersSidebar />)
    expect(screen.getByRole('link', { name: 'Users' }).className).toContain('border-primary')
  })

  it('collapses and expands the CATALOG group on toggle', () => {
    mockPathname = '/studio/catalog/brands'
    render(<UsersSidebar />)
    const toggle = screen.getByRole('button', { name: /^catalog$/i })
    fireEvent.click(toggle)
    expect(screen.queryByRole('link', { name: 'Brands' })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByRole('link', { name: 'Brands' })).toBeInTheDocument()
  })

  it('collapses and expands the ADMIN group on toggle', () => {
    render(<UsersSidebar />)
    const toggle = screen.getByRole('button', { name: /^admin$/i })
    fireEvent.click(toggle)
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()
  })

  it('hides the ADMIN group for non-admin users', () => {
    mockUseAuth = () => ({ username: 'alice', role: 'user', logout: mockLogout })
    render(<UsersSidebar />)
    expect(screen.queryByRole('button', { name: /^admin$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
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
