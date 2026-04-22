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
let mockPathname = '/controlroom/session/effects'

describe('Sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth = () => ({ username: 'alice', role: 'user', logout: mockLogout })
    mockPathname = '/controlroom/session/effects'
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
    expect(screen.getByRole('button', { name: /SESSION/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /TOOLS/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /CONFIG/i })).toBeInTheDocument()
  })

  it('does not render a CATALOG group', () => {
    render(<Sidebar />)
    expect(screen.queryByRole('button', { name: /^CATALOG$/i })).not.toBeInTheDocument()
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

  it('does not apply active link styling when path does not match', () => {
    mockPathname = '/unrelated'
    render(<Sidebar />)
    // SESSION is collapsed; open it to inspect the Effects link class
    fireEvent.click(screen.getByRole('button', { name: /SESSION/i }))
    const effectsLink = screen.getByRole('link', { name: 'Effects' })
    expect(effectsLink.className).not.toContain('text-primary')
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

})
