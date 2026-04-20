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

  it('renders the ControlRoom module tile linking to catalog/brands', () => {
    render(<HomePage />)
    const link = screen.getByRole('link', { name: /controlroom/i })
    expect(link).toHaveAttribute('href', '/controlroom/catalog/brands')
  })

  it('renders the User Management module tile linking to /users', () => {
    render(<HomePage />)
    const link = screen.getByRole('link', { name: /user management/i })
    expect(link).toHaveAttribute('href', '/users')
  })

  it('renders the studio illustration', () => {
    render(<HomePage />)
    expect(screen.getByTestId('studio-illustration')).toBeInTheDocument()
  })
})
