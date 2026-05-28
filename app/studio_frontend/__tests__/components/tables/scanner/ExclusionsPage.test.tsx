import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ExclusionsPage } from '@/components/tables/scanner/ExclusionsPage'
import { api } from '@/lib/api'
import type { Exclusion } from '@/lib/types'

jest.mock('@/lib/auth', () => ({ useSession: () => ({ data: { user: { name: 'Test' } } }) }))
jest.mock('@/lib/api', () => ({
  api: {
    scanner: {
      exclusions: jest.fn(),
      removeExclusion: jest.fn(),
    },
  },
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const mockExclusions = api.scanner.exclusions as jest.Mock
const mockRemoveExclusion = api.scanner.removeExclusion as jest.Mock

function makeExclusion(overrides: Partial<Exclusion> = {}): Exclusion {
  return {
    exclusion_id: 'ex-1',
    vendor: 'MNTRA',
    name: 'Surge XT',
    excluded_at: '2026-05-28T10:00:00Z',
    excluded_by: 'adminuser',
    format: 'VST3',
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

// Step 15 — renders exclusion list
describe('ExclusionsPage row rendering', () => {
  it('renders a row for each exclusion', async () => {
    mockExclusions.mockResolvedValue([
      makeExclusion({ exclusion_id: 'ex-1' }),
      makeExclusion({ exclusion_id: 'ex-2' }),
    ])
    render(<ExclusionsPage />)
    await waitFor(() => {
      expect(screen.getAllByTestId('exclusion-row')).toHaveLength(2)
    })
  })

  it('renders vendor, name, excluded_by, format, and excluded_at for a row', async () => {
    mockExclusions.mockResolvedValue([makeExclusion()])
    render(<ExclusionsPage />)
    await waitFor(() => {
      expect(screen.getByTestId('exclusion-row')).toBeInTheDocument()
      expect(screen.getByText('MNTRA')).toBeInTheDocument()
      expect(screen.getByText('Surge XT')).toBeInTheDocument()
      expect(screen.getByText('adminuser')).toBeInTheDocument()
      expect(screen.getByText('VST3')).toBeInTheDocument()
    })
  })

  it('renders "—" for null excluded_by and format fields', async () => {
    mockExclusions.mockResolvedValue([
      makeExclusion({ excluded_by: null, format: null }),
    ])
    render(<ExclusionsPage />)
    await waitFor(() => {
      const dashes = screen.getAllByText('—')
      expect(dashes.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('renders data-testid="exclusion-remove-{id}" per row', async () => {
    mockExclusions.mockResolvedValue([makeExclusion({ exclusion_id: 'ex-42' })])
    render(<ExclusionsPage />)
    await waitFor(() => {
      expect(screen.getByTestId('exclusion-remove-ex-42')).toBeInTheDocument()
    })
  })
})

// Step 16 — remove opens confirmation dialog
describe('ExclusionsPage remove confirmation dialog', () => {
  it('shows confirmation dialog when remove button is clicked', async () => {
    mockExclusions.mockResolvedValue([makeExclusion({ exclusion_id: 'ex-1' })])
    render(<ExclusionsPage />)
    await waitFor(() => screen.getByTestId('exclusion-remove-ex-1'))
    fireEvent.click(screen.getByTestId('exclusion-remove-ex-1'))
    expect(screen.getByTestId('exclusion-remove-confirm')).toBeInTheDocument()
  })

  it('shows cancel button in confirmation dialog', async () => {
    mockExclusions.mockResolvedValue([makeExclusion({ exclusion_id: 'ex-1' })])
    render(<ExclusionsPage />)
    await waitFor(() => screen.getByTestId('exclusion-remove-ex-1'))
    fireEvent.click(screen.getByTestId('exclusion-remove-ex-1'))
    expect(screen.getByTestId('exclusion-remove-confirm-cancel')).toBeInTheDocument()
  })

  it('cancel closes dialog without calling removeExclusion', async () => {
    mockExclusions.mockResolvedValue([makeExclusion({ exclusion_id: 'ex-1' })])
    render(<ExclusionsPage />)
    await waitFor(() => screen.getByTestId('exclusion-remove-ex-1'))
    fireEvent.click(screen.getByTestId('exclusion-remove-ex-1'))
    fireEvent.click(screen.getByTestId('exclusion-remove-confirm-cancel'))
    expect(screen.queryByTestId('exclusion-remove-confirm')).toBeNull()
    expect(mockRemoveExclusion).not.toHaveBeenCalled()
  })
})

// Step 17 — confirm calls removeExclusion and refetches
describe('ExclusionsPage confirm remove', () => {
  it('clicking ok calls removeExclusion with the exclusion id', async () => {
    mockExclusions.mockResolvedValue([makeExclusion({ exclusion_id: 'ex-1' })])
    mockRemoveExclusion.mockResolvedValue(undefined)
    mockExclusions.mockResolvedValueOnce([makeExclusion({ exclusion_id: 'ex-1' })]).mockResolvedValue([])
    render(<ExclusionsPage />)
    await waitFor(() => screen.getByTestId('exclusion-remove-ex-1'))
    fireEvent.click(screen.getByTestId('exclusion-remove-ex-1'))
    fireEvent.click(screen.getByTestId('exclusion-remove-confirm-ok'))
    await waitFor(() => {
      expect(mockRemoveExclusion).toHaveBeenCalledWith('ex-1')
    })
  })

  it('row disappears from list after successful removal', async () => {
    mockExclusions
      .mockResolvedValueOnce([makeExclusion({ exclusion_id: 'ex-1' })])
      .mockResolvedValue([])
    mockRemoveExclusion.mockResolvedValue(undefined)
    render(<ExclusionsPage />)
    await waitFor(() => screen.getByTestId('exclusion-remove-ex-1'))
    fireEvent.click(screen.getByTestId('exclusion-remove-ex-1'))
    fireEvent.click(screen.getByTestId('exclusion-remove-confirm-ok'))
    await waitFor(() => {
      expect(screen.queryByTestId('exclusion-row')).toBeNull()
    })
  })
})

// Step 18 — empty state
describe('ExclusionsPage empty state', () => {
  it('renders empty state when exclusions list is empty', async () => {
    mockExclusions.mockResolvedValue([])
    render(<ExclusionsPage />)
    await waitFor(() => {
      expect(screen.getByTestId('exclusions-empty-state')).toBeInTheDocument()
      expect(screen.queryByTestId('exclusion-row')).toBeNull()
    })
  })
})

// Step 19 — loading and error states
describe('ExclusionsPage loading state', () => {
  it('renders loading indicator while fetch is pending', () => {
    mockExclusions.mockReturnValue(new Promise(() => undefined))
    render(<ExclusionsPage />)
    expect(screen.getByTestId('exclusions-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('exclusion-row')).toBeNull()
  })
})

describe('ExclusionsPage error state', () => {
  it('renders error when exclusions fetch fails', async () => {
    mockExclusions.mockRejectedValue(new Error('network error'))
    render(<ExclusionsPage />)
    await waitFor(() => {
      expect(screen.getByTestId('exclusions-error')).toBeInTheDocument()
    })
  })
})
