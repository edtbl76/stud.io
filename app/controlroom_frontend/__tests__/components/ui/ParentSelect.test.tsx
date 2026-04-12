import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ParentSelect } from '@/components/ui/ParentSelect'
import type { ParentRef } from '@/lib/types'

const mockSearchEntities = jest.fn()
const mockPushRecent = jest.fn()
const mockLoadRecents = jest.fn((): ParentRef[] => [])

jest.mock('@/lib/api', () => ({
  api: {
    searchEntities: (...args: unknown[]) => mockSearchEntities(...args),
  },
}))

jest.mock('@/lib/parentSelectRecents', () => ({
  loadRecents: () => mockLoadRecents(),
  pushRecent: (...args: unknown[]) => mockPushRecent(...args),
}))

function typeQuery(value = 'rev') {
  const input = screen.getByPlaceholderText('Search parents...')
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  return input
}

async function performSearch(displayText: string) {
  typeQuery()
  await waitFor(() => screen.getByText(displayText))
  fireEvent.click(screen.getByText(displayText))
}

describe('ParentSelect', () => {
  beforeEach(() => {
    mockSearchEntities.mockReset()
    mockPushRecent.mockReset()
    mockLoadRecents.mockReset()
    mockLoadRecents.mockReturnValue([])
  })

  it('renders the search input', () => {
    render(<ParentSelect value={[]} selectedParents={[]} onChange={jest.fn()} />)
    expect(screen.getByPlaceholderText('Search parents...')).toBeInTheDocument()
  })

  it('shows search results after typing', async () => {
    mockSearchEntities.mockResolvedValue({
      results: [{ table_name: 'effects', id: 'e-1', name: 'Reverb', brand_name: 'Lexicon' }],
    })
    render(<ParentSelect value={[]} selectedParents={[]} onChange={jest.fn()} />)
    typeQuery()
    await waitFor(() => expect(screen.getByText('Lexicon – Reverb')).toBeInTheDocument())
    expect(screen.getByText('effects')).toBeInTheDocument()
  })

  it('shows selected parent as a badge chip', () => {
    render(
      <ParentSelect
        value={[{ table_name: 'effects', id: 'e-1' }]}
        selectedParents={[{ table_name: 'effects', id: 'e-1', name: 'Reverb' }]}
        onChange={jest.fn()}
      />
    )
    expect(screen.getByText('Reverb')).toBeInTheDocument()
  })

  it('calls onChange when a result is selected', async () => {
    mockSearchEntities.mockResolvedValue({
      results: [{ table_name: 'effects', id: 'e-1', name: 'Reverb', brand_name: null }],
    })
    const onChange = jest.fn()
    render(<ParentSelect value={[]} selectedParents={[]} onChange={onChange} />)
    await performSearch('Reverb')
    expect(onChange).toHaveBeenCalledWith(
      [{ table_name: 'effects', id: 'e-1' }],
      [{ table_name: 'effects', id: 'e-1', name: 'Reverb' }],
    )
  })

  it('pushes to recents when a result is newly selected', async () => {
    mockSearchEntities.mockResolvedValue({
      results: [{ table_name: 'effects', id: 'e-1', name: 'Reverb', brand_name: 'Lexicon' }],
    })
    render(<ParentSelect value={[]} selectedParents={[]} onChange={jest.fn()} />)
    await performSearch('Lexicon – Reverb')
    expect(mockPushRecent).toHaveBeenCalledWith(
      expect.objectContaining({ table_name: 'effects', id: 'e-1', name: 'Lexicon – Reverb' })
    )
  })

  it('calls onChange to deselect when the badge remove button is clicked', () => {
    const onChange = jest.fn()
    render(
      <ParentSelect
        value={[{ table_name: 'effects', id: 'e-1' }]}
        selectedParents={[{ table_name: 'effects', id: 'e-1', name: 'Reverb' }]}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove Reverb' }))
    expect(onChange).toHaveBeenCalledWith([], [])
  })

  it('shows recents when input is focused with empty query', async () => {
    mockLoadRecents.mockReturnValue([
      { table_name: 'instruments', id: 'i-1', name: 'Prophet 5' },
    ])
    render(<ParentSelect value={[]} selectedParents={[]} onChange={jest.fn()} />)
    const input = screen.getByPlaceholderText('Search parents...')
    fireEvent.focus(input)
    await waitFor(() => expect(screen.getByText('Recent')).toBeInTheDocument())
    expect(screen.getByText('Prophet 5')).toBeInTheDocument()
  })

  it('passes excludeTable and excludeId through to searchEntities', async () => {
    mockSearchEntities.mockResolvedValue({ results: [] })
    render(
      <ParentSelect
        value={[]}
        selectedParents={[]}
        onChange={jest.fn()}
        excludeTable="effects"
        excludeId="e-1"
      />
    )
    typeQuery()
    await waitFor(() => expect(mockSearchEntities).toHaveBeenCalledWith('rev', 'effects', 'e-1'))
  })

  it('does not crash and shows no dropdown when searchEntities rejects', async () => {
    mockSearchEntities.mockRejectedValue(new Error('fail'))
    render(<ParentSelect value={[]} selectedParents={[]} onChange={jest.fn()} />)
    const input = typeQuery()
    await waitFor(() => expect(mockSearchEntities).toHaveBeenCalled())
    expect(input).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows no result items when api returns empty results', async () => {
    mockSearchEntities.mockResolvedValue({ results: [] })
    render(<ParentSelect value={[]} selectedParents={[]} onChange={jest.fn()} />)
    typeQuery('xyz')
    await waitFor(() => expect(mockSearchEntities).toHaveBeenCalled())
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('does not push to recents when deselecting an existing entry via search results', async () => {
    mockSearchEntities.mockResolvedValue({
      results: [{ table_name: 'effects', id: 'e-1', name: 'Reverb', brand_name: null }],
    })
    render(
      <ParentSelect
        value={[{ table_name: 'effects', id: 'e-1' }]}
        selectedParents={[{ table_name: 'effects', id: 'e-1', name: 'Reverb' }]}
        onChange={jest.fn()}
      />
    )
    typeQuery()
    await waitFor(() => screen.getByText('Reverb'))
    fireEvent.click(screen.getByText('Reverb'))
    expect(mockPushRecent).not.toHaveBeenCalled()
  })
})
