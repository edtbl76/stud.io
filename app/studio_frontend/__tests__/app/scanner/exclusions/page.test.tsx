import React from 'react'
import { render, screen } from '@testing-library/react'
import Page from '@/app/controlroom/scanner/exclusions/page'

jest.mock('@/components/tables/scanner/ExclusionsPage', () => ({
  ExclusionsPage: () => <div data-testid="exclusions-page" />,
}))

describe('scanner exclusions page shell', () => {
  it('renders ExclusionsPage', () => {
    render(<Page />)
    expect(screen.getByTestId('exclusions-page')).toBeInTheDocument()
  })
})
