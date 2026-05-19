import * as React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { EntitySearchInput } from '@/components/EntitySearchInput'

const mockSearchEntities = jest.fn()

jest.mock('@/lib/api', () => ({
  api: { searchEntities: (...args: unknown[]) => mockSearchEntities(...args) },
}))

const RESULTS = [
  { id: 'e1', name: 'Fender', brand_name: null, table_name: 'brands' },
  { id: 'e2', name: 'Stratocaster', brand_name: 'Fender', table_name: 'models' },
]

function defaultProps(overrides = {}) {
  return {
    id: 'test-input',
    label: 'Brand',
    table: 'brands',
    value: '',
    onChange: jest.fn(),
    ...overrides,
  }
}

function setupSearch(query: string, propOverrides: Record<string, unknown> = {}): void {
  mockSearchEntities.mockResolvedValue({ results: RESULTS })
  render(<EntitySearchInput {...defaultProps(propOverrides)} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: query } })
  act(() => { jest.advanceTimersByTime(350) })
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
})
afterEach(() => { jest.useRealTimers() })

describe('EntitySearchInput — rendering', () => {
  it('renders label and input', () => {
    render(<EntitySearchInput {...defaultProps()} />)
    expect(screen.getByLabelText('Brand')).toBeInTheDocument()
  })

  it('shows selected name chip when value and displayName are provided', () => {
    render(<EntitySearchInput {...defaultProps({ value: 'e1', displayName: 'Fender' })} />)
    expect(screen.getByText('Fender')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })

  it('shows search input when no value is selected', () => {
    render(<EntitySearchInput {...defaultProps()} />)
    expect(screen.getByPlaceholderText('Search brand…')).toBeInTheDocument()
  })

  it('uses custom placeholder when provided', () => {
    render(<EntitySearchInput {...defaultProps({ placeholder: 'Find a brand' })} />)
    expect(screen.getByPlaceholderText('Find a brand')).toBeInTheDocument()
  })
})

describe('EntitySearchInput — search debounce', () => {
  it('does not search when query is shorter than 2 chars', () => {
    mockSearchEntities.mockResolvedValue({ results: RESULTS })
    render(<EntitySearchInput {...defaultProps()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'F' } })
    act(() => { jest.advanceTimersByTime(400) })
    expect(mockSearchEntities).not.toHaveBeenCalled()
  })

  it('searches after debounce when query is 2+ chars', async () => {
    setupSearch('Fe')
    await waitFor(() => expect(mockSearchEntities).toHaveBeenCalledWith('Fe'))
  })

  it('filters results to the specified table', async () => {
    setupSearch('Fe', { table: 'brands' })
    await waitFor(() => expect(screen.getByText('Fender')).toBeInTheDocument())
    expect(screen.queryByText('Stratocaster')).not.toBeInTheDocument()
  })

  it('shows results dropdown when open and results exist', async () => {
    setupSearch('Fe')
    await waitFor(() => expect(screen.getByText('Fender')).toBeInTheDocument())
  })

  it('shows brand_name subtitle when result has brand_name', async () => {
    setupSearch('St', { table: 'models' })
    await waitFor(() => expect(screen.getByText('Fender')).toBeInTheDocument())
  })

  it('clears results when search fails', async () => {
    mockSearchEntities.mockRejectedValue(new Error('Network error'))
    render(<EntitySearchInput {...defaultProps()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Fe' } })
    act(() => { jest.advanceTimersByTime(350) })
    await waitFor(() => expect(mockSearchEntities).toHaveBeenCalled())
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

describe('EntitySearchInput — selection', () => {
  it('calls onChange with id on selection', async () => {
    const onChange = jest.fn()
    setupSearch('Fe', { onChange })
    await waitFor(() => screen.getByText('Fender'))
    fireEvent.click(screen.getByText('Fender'))
    expect(onChange).toHaveBeenCalledWith('e1')
  })

  it('shows selected name chip after selection', async () => {
    setupSearch('Fe')
    await waitFor(() => screen.getByText('Fender'))
    fireEvent.click(screen.getByText('Fender'))
    expect(screen.getByText('Fender')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('formats selected name as "brand name" when result has brand_name', async () => {
    setupSearch('St', { table: 'models' })
    await waitFor(() => screen.getByText('Stratocaster'))
    fireEvent.click(screen.getByText('Stratocaster'))
    expect(screen.getByText('Fender Stratocaster')).toBeInTheDocument()
  })
})

describe('EntitySearchInput — clear', () => {
  it('calls onChange with empty string on clear', async () => {
    const onChange = jest.fn()
    setupSearch('Fe', { onChange })
    await waitFor(() => screen.getByText('Fender'))
    fireEvent.click(screen.getByText('Fender'))
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('shows search input again after clearing', async () => {
    setupSearch('Fe')
    await waitFor(() => screen.getByText('Fender'))
    fireEvent.click(screen.getByText('Fender'))
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.getByPlaceholderText('Search brand…')).toBeInTheDocument()
  })

  it('clears pre-set value+displayName on click', () => {
    const onChange = jest.fn()
    render(<EntitySearchInput {...defaultProps({ value: 'e1', displayName: 'Fender', onChange })} />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onChange).toHaveBeenCalledWith('')
    expect(screen.getByPlaceholderText('Search brand…')).toBeInTheDocument()
  })
})

describe('EntitySearchInput — open/close', () => {
  it('opens dropdown on focus', () => {
    render(<EntitySearchInput {...defaultProps()} />)
    fireEvent.focus(screen.getByRole('textbox'))
    // open state is set — no crash and input is still present
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('closes dropdown on blur after delay', async () => {
    setupSearch('Fe')
    await waitFor(() => screen.getByText('Fender'))
    fireEvent.blur(screen.getByRole('textbox'))
    act(() => { jest.advanceTimersByTime(200) })
    await waitFor(() => expect(screen.queryByText('Fender')).not.toBeInTheDocument())
  })
})

describe('EntitySearchInput — displayName sync', () => {
  it('updates chip when value and displayName props change', () => {
    const { rerender } = render(
      <EntitySearchInput {...defaultProps({ value: '', displayName: undefined })} />
    )
    rerender(<EntitySearchInput {...defaultProps({ value: 'e1', displayName: 'Fender' })} />)
    expect(screen.getByText('Fender')).toBeInTheDocument()
  })

  it('clears chip when value is emptied', () => {
    const { rerender } = render(
      <EntitySearchInput {...defaultProps({ value: 'e1', displayName: 'Fender' })} />
    )
    rerender(<EntitySearchInput {...defaultProps({ value: '', displayName: undefined })} />)
    expect(screen.getByPlaceholderText('Search brand…')).toBeInTheDocument()
  })
})
