import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '@/components/layout/Sidebar'

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ prefetchInfiniteQuery: jest.fn(), prefetchQuery: jest.fn() }),
}))

jest.mock('@/lib/api', () => ({ api: { listPaged: jest.fn(), list: jest.fn() } }))

const mockLogout = jest.fn().mockResolvedValue(undefined)

jest.mock('@/lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}))

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

let mockUseAuth = () => ({ username: 'alice', role: 'user', logout: mockLogout })
let mockPathname = '/controlroom/session/effects'

describe('Sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth = () => ({ username: 'alice', role: 'user', logout: mockLogout })
    mockPathname = '/controlroom/session/effects'
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
    expect(screen.getByRole('button', { name: /SESSION/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /TOOLS/i })).toBeInTheDocument()
  })

  it('does not render a CATALOG group', () => {
    render(<Sidebar />)
    expect(screen.queryByRole('button', { name: /^CATALOG$/i })).not.toBeInTheDocument()
  })

  it('does not render a CONFIG group', () => {
    render(<Sidebar />)
    expect(screen.queryByRole('button', { name: /^CONFIG$/i })).not.toBeInTheDocument()
  })

  it('does not render an ADMIN group', () => {
    render(<Sidebar />)
    expect(screen.queryByRole('button', { name: /^ADMIN$/i })).not.toBeInTheDocument()
  })

  it('expands a group when its header is clicked', () => {
    mockPathname = '/controlroom/tools/workflow'
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: /SESSION/i }))
    expect(screen.getByRole('link', { name: 'Effects' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Instruments' })).toBeInTheDocument()
  })

  it('collapses an expanded group when its header is clicked again', () => {
    mockPathname = '/controlroom/tools/workflow'
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: /SESSION/i }))
    expect(screen.getByRole('link', { name: 'Effects' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /SESSION/i }))
    expect(screen.queryByRole('link', { name: 'Effects' })).not.toBeInTheDocument()
  })

  it('applies active link styling for the current path', () => {
    mockPathname = '/controlroom/session/effects'
    render(<Sidebar />)
    // SESSION group auto-expands because /session/effects is the active path
    const effectsLink = screen.getByRole('link', { name: 'Effects' })
    expect(effectsLink.className).toContain('text-primary')
  })

  it('applies active link styling for a nested path under the item href', () => {
    mockPathname = '/controlroom/session/effects/details'
    render(<Sidebar />)
    // SESSION group auto-expands; nested path matches via startsWith(href + '/')
    const effectsLink = screen.getByRole('link', { name: 'Effects' })
    expect(effectsLink.className).toContain('text-primary')
  })

  // Step 48
  it('renders Plugin Scanner Rules link pointing to /controlroom/scanner/rules', () => {
    mockPathname = '/controlroom/scanner/rules'
    render(<Sidebar />)
    // Group auto-expands when on a scanner path — no button click needed
    const link = screen.getByRole('link', { name: 'Plugin Scanner Rules' })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/controlroom/scanner/rules')
  })

  it('does not apply active link styling when path does not match', () => {
    mockPathname = '/unrelated'
    render(<Sidebar />)
    // SESSION is collapsed; open it to inspect the Effects link class
    fireEvent.click(screen.getByRole('button', { name: /SESSION/i }))
    const effectsLink = screen.getByRole('link', { name: 'Effects' })
    expect(effectsLink.className).not.toContain('text-primary')
  })

})
