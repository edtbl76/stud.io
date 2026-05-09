import * as React from 'react'
import { render, screen } from '@testing-library/react'
import SearchLayout from '@/app/search/layout'

jest.mock('@/components/layout/SidebarShell', () => ({
  SidebarShell: ({ subtitle }: { subtitle: string }) => (
    <div data-testid="sidebar-shell" data-subtitle={subtitle} />
  ),
}))

describe('SearchLayout', () => {
  it('renders SidebarShell with "Search Results" subtitle', () => {
    render(<SearchLayout><div>content</div></SearchLayout>)
    const shell = screen.getByTestId('sidebar-shell')
    expect(shell).toHaveAttribute('data-subtitle', 'Search Results')
  })

  it('renders children', () => {
    render(<SearchLayout><div data-testid="child">content</div></SearchLayout>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })
})
