import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { LayoutShell } from '@/components/layout/LayoutShell'

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({ push: jest.fn() }),
}))

const { usePathname } = jest.requireMock('next/navigation') as { usePathname: jest.Mock }

describe('LayoutShell', () => {
  it('renders children without TopBar on /login', () => {
    usePathname.mockReturnValue('/login')
    render(<LayoutShell><div data-testid="child">content</div></LayoutShell>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search everything...')).not.toBeInTheDocument()
  })

  it('renders children without TopBar on /', () => {
    usePathname.mockReturnValue('/')
    render(<LayoutShell><div data-testid="child">content</div></LayoutShell>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search everything...')).not.toBeInTheDocument()
  })

  it('renders TopBar on /controlroom', () => {
    usePathname.mockReturnValue('/controlroom/session/effects')
    render(<LayoutShell><div>content</div></LayoutShell>)
    expect(screen.getByPlaceholderText('Search everything...')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('renders TopBar on /search', () => {
    usePathname.mockReturnValue('/search')
    render(<LayoutShell><div>content</div></LayoutShell>)
    expect(screen.getByPlaceholderText('Search everything...')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })
})
