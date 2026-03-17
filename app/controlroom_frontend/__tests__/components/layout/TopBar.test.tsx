import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopBar } from '@/components/layout/TopBar'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('TopBar', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the title', () => {
    render(<TopBar title="Effects" />)
    expect(screen.getByText('Effects')).toBeInTheDocument()
  })

  it('renders a search input', () => {
    render(<TopBar title="Effects" />)
    expect(screen.getByPlaceholderText('Global search...')).toBeInTheDocument()
  })

  it('navigates to search route when form is submitted with a query', () => {
    render(<TopBar title="Effects" />)
    const input = screen.getByPlaceholderText('Global search...')
    fireEvent.change(input, { target: { value: 'reverb' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockPush).toHaveBeenCalledWith('/search?q=reverb')
  })

  it('does not navigate when query is empty or whitespace-only', () => {
    render(<TopBar title="Effects" />)
    const input = screen.getByPlaceholderText('Global search...')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('trims whitespace from the search query', () => {
    render(<TopBar title="Effects" />)
    const input = screen.getByPlaceholderText('Global search...')
    fireEvent.change(input, { target: { value: '  delay  ' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockPush).toHaveBeenCalledWith('/search?q=delay')
  })
})
