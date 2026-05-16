import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ManualMappingModal } from '@/components/tables/scanner/ManualMappingModal'

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { username: 'admin', role: 'admin' }, login: jest.fn(), loginGoogle: jest.fn() }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    scanner: {
      catalogSearch: jest.fn(),
    },
  },
}))

const { api } = jest.requireMock('@/lib/api') as { api: { scanner: Record<string, jest.Mock> } }

const RESULT = { record_id: 'rec1', record_table: 'effects', name: 'Reverb X', vendor: 'Acme', version: '1.0.0' }

describe('ManualMappingModal', () => {
  beforeEach(() => jest.clearAllMocks())

  it('pre-fills the search input with initialName', () => {
    api.scanner.catalogSearch.mockResolvedValue([])
    render(<ManualMappingModal initialName="Reverb Pro" onConfirm={jest.fn()} onClose={jest.fn()} />)
    expect(screen.getByTestId('catalog-search-input')).toHaveValue('Reverb Pro')
  })

  it('renders results when search returns matches', async () => {
    api.scanner.catalogSearch.mockResolvedValue([RESULT])
    render(<ManualMappingModal initialName="Reverb" onConfirm={jest.fn()} onClose={jest.fn()} />)
    await waitFor(() => expect(screen.getByTestId('catalog-search-result-effects-rec1')).toBeInTheDocument())
    expect(screen.getByText('Reverb X')).toBeInTheDocument()
  })

  it('shows empty state when search returns no results', async () => {
    api.scanner.catalogSearch.mockResolvedValue([])
    render(<ManualMappingModal initialName="zz" onConfirm={jest.fn()} onClose={jest.fn()} />)
    await waitFor(() => expect(screen.getByTestId('catalog-search-empty')).toBeInTheDocument())
  })

  it('Confirm button is disabled when no result is selected', async () => {
    api.scanner.catalogSearch.mockResolvedValue([RESULT])
    render(<ManualMappingModal initialName="Reverb" onConfirm={jest.fn()} onClose={jest.fn()} />)
    await waitFor(() => screen.getByTestId('catalog-search-result-effects-rec1'))
    expect(screen.getByTestId('manual-mapping-confirm')).toBeDisabled()
  })

  it('selecting a result enables the Confirm button', async () => {
    api.scanner.catalogSearch.mockResolvedValue([RESULT])
    render(<ManualMappingModal initialName="Reverb" onConfirm={jest.fn()} onClose={jest.fn()} />)
    await waitFor(() => screen.getByTestId('catalog-search-result-effects-rec1'))
    fireEvent.click(screen.getByTestId('catalog-search-result-effects-rec1'))
    expect(screen.getByTestId('manual-mapping-confirm')).not.toBeDisabled()
  })

  it('calls onConfirm with recordId and recordTable when Confirm is clicked', async () => {
    api.scanner.catalogSearch.mockResolvedValue([RESULT])
    const onConfirm = jest.fn()
    render(<ManualMappingModal initialName="Reverb" onConfirm={onConfirm} onClose={jest.fn()} />)
    await waitFor(() => screen.getByTestId('catalog-search-result-effects-rec1'))
    fireEvent.click(screen.getByTestId('catalog-search-result-effects-rec1'))
    fireEvent.click(screen.getByTestId('manual-mapping-confirm'))
    expect(onConfirm).toHaveBeenCalledWith('rec1', 'effects')
  })

  it('does not crash and keeps Confirm disabled when catalogSearch rejects', async () => {
    api.scanner.catalogSearch.mockRejectedValue(new Error('Network error'))
    const onClose = jest.fn()
    render(<ManualMappingModal initialName="Reverb" onConfirm={jest.fn()} onClose={onClose} />)
    await waitFor(() => expect(screen.getByTestId('catalog-search-empty')).toBeInTheDocument())
    expect(screen.getByTestId('manual-mapping-confirm')).toBeDisabled()
    fireEvent.click(screen.getByTestId('manual-mapping-cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked', () => {
    api.scanner.catalogSearch.mockResolvedValue([])
    const onClose = jest.fn()
    render(<ManualMappingModal initialName="x" onConfirm={jest.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('manual-mapping-cancel'))
    expect(onClose).toHaveBeenCalled()
  })
})
