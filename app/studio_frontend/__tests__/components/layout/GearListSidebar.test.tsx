import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { GearListSidebar } from '@/components/layout/GearListSidebar'

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ prefetchInfiniteQuery: jest.fn(), prefetchQuery: jest.fn() }),
}))

jest.mock('@/lib/api', () => ({ api: { listPaged: jest.fn(), list: jest.fn() } }))

const mockLogout = jest.fn().mockResolvedValue(undefined)
let mockPathname = '/gearlist/guitars'

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ username: 'alice', role: 'admin', logout: mockLogout }),
}))

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

describe('GearListSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPathname = '/gearlist/guitars'
  })

  it('renders the app name and module title', () => {
    render(<GearListSidebar />)
    expect(screen.getByText('STUD.io')).toBeInTheDocument()
    expect(screen.getByText('GearList')).toBeInTheDocument()
  })

  it('renders the GEAR group header', () => {
    render(<GearListSidebar />)
    expect(screen.getByRole('button', { name: /^gear$/i })).toBeInTheDocument()
  })

  it.each([
    ['Guitars',    '/gearlist/guitars'],
    ['Other Gear', '/gearlist/other-gear'],
  ])('renders %s nav link pointing to %s', (label, href) => {
    render(<GearListSidebar />)
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href)
  })

  it('applies active styles when pathname matches /gearlist/guitars', () => {
    mockPathname = '/gearlist/guitars'
    render(<GearListSidebar />)
    expect(screen.getByRole('link', { name: 'Guitars' }).className).toContain('border-primary')
  })

  it('applies active styles when pathname matches /gearlist/other-gear', () => {
    mockPathname = '/gearlist/other-gear'
    render(<GearListSidebar />)
    expect(screen.getByRole('link', { name: 'Other Gear' }).className).toContain('border-primary')
  })

  it('collapses and expands the GEAR group on toggle', () => {
    render(<GearListSidebar />)
    const toggle = screen.getByRole('button', { name: /^gear$/i })
    fireEvent.click(toggle)
    expect(screen.queryByRole('link', { name: 'Guitars' })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByRole('link', { name: 'Guitars' })).toBeInTheDocument()
  })
})
