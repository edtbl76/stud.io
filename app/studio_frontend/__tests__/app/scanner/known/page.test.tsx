import React from 'react'
import { render, screen } from '@testing-library/react'
import Page from '@/app/controlroom/scanner/known/page'

jest.mock('@/components/tables/scanner/KnownPage', () => ({
  KnownPage: () => <div data-testid="known-page" />,
}))

describe('scanner known page shell', () => {
  it('renders KnownPage', () => {
    render(<Page />)
    expect(screen.getByTestId('known-page')).toBeInTheDocument()
  })
})
