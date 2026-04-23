import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { ModuleSwitcher } from '@/components/layout/ModuleSwitcher'

let mockPathname = '/controlroom/session/effects'

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

describe('ModuleSwitcher', () => {
  it('hides the current module and shows the others', () => {
    mockPathname = '/controlroom/session/effects'
    render(<ModuleSwitcher />)
    expect(screen.queryByRole('link', { name: /controlroom/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /studio management/i })).toBeInTheDocument()
  })

  it('hides Studio Management when on a /studio path', () => {
    mockPathname = '/studio/admin/users'
    render(<ModuleSwitcher />)
    expect(screen.queryByRole('link', { name: /studio management/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /controlroom/i })).toBeInTheDocument()
  })

  it('hides Home when on the root path', () => {
    mockPathname = '/'
    render(<ModuleSwitcher />)
    expect(screen.queryByRole('link', { name: /home/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /controlroom/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /studio management/i })).toBeInTheDocument()
  })

  it('ControlRoom link points to session/effects entry', () => {
    mockPathname = '/studio/admin/users'
    render(<ModuleSwitcher />)
    expect(screen.getByRole('link', { name: /controlroom/i })).toHaveAttribute('href', '/controlroom/session/effects')
  })

  it('Studio Management link points to /studio/admin/users', () => {
    mockPathname = '/controlroom/session/effects'
    render(<ModuleSwitcher />)
    expect(screen.getByRole('link', { name: /studio management/i })).toHaveAttribute('href', '/studio/admin/users')
  })
})
