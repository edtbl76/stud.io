import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopBar } from '@/components/layout/TopBar'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('TopBar', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it('renders the search input with correct placeholder', () => {
    render(<TopBar />)
    expect(screen.getByPlaceholderText('Search everything...')).toBeInTheDocument()
  })

  it('navigates to /search when a query of 2+ chars is submitted', () => {
    render(<TopBar />)
    const input = screen.getByPlaceholderText('Search everything...')
    fireEvent.change(input, { target: { value: 'reverb' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockPush).toHaveBeenCalledWith('/search?q=reverb')
  })

  it('encodes special characters in the query', () => {
    render(<TopBar />)
    const input = screen.getByPlaceholderText('Search everything...')
    fireEvent.change(input, { target: { value: 'guitar & bass' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockPush).toHaveBeenCalledWith('/search?q=guitar%20%26%20bass')
  })

  it('does not navigate when query is shorter than 2 characters', () => {
    render(<TopBar />)
    const input = screen.getByPlaceholderText('Search everything...')
    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('does not navigate for a whitespace-only query', () => {
    render(<TopBar />)
    const input = screen.getByPlaceholderText('Search everything...')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('trims whitespace before navigating', () => {
    render(<TopBar />)
    const input = screen.getByPlaceholderText('Search everything...')
    fireEvent.change(input, { target: { value: '  reverb  ' } })
    fireEvent.submit(input.closest('form')!)
    expect(mockPush).toHaveBeenCalledWith('/search?q=reverb')
  })
})
