import * as React from 'react'
import { render, screen } from '@testing-library/react'
import HomePage from '@/app/page'

jest.mock('@/components/StudioIllustration', () => ({
  StudioIllustration: ({ className }: { className?: string }) => (
    <div data-testid="studio-illustration" className={className} />
  ),
}))

describe('HomePage', () => {
  it('renders the welcome heading', () => {
    render(<HomePage />)
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
  })

  it('renders the ControlRoom module tile linking to session/effects', () => {
    render(<HomePage />)
    const link = screen.getByRole('link', { name: /controlroom/i })
    expect(link).toHaveAttribute('href', '/controlroom/session/effects')
    expect(link).toHaveTextContent('Manage sessions, libraries, and tools.')
  })


  it('renders the Studio Management module tile linking to /studio/admin/users', () => {
    render(<HomePage />)
    const link = screen.getByRole('link', { name: /studio management/i })
    expect(link).toHaveAttribute('href', '/studio/admin/users')
    expect(link).toHaveTextContent('Manage gear catalog, config, users, and administration.')
  })

  it('renders the studio illustration', () => {
    render(<HomePage />)
    expect(screen.getByTestId('studio-illustration')).toBeInTheDocument()
  })
})
