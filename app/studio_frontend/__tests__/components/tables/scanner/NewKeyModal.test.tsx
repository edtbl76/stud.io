import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewKeyModal } from '@/components/tables/scanner/NewKeyModal'

const RESULT = {
  key_id: 'key-1',
  label: 'ci-runner',
  key: 'psc_' + 'a'.repeat(64),
  key_hint: 'aaaa',
}

Object.assign(navigator, {
  clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
})

describe('NewKeyModal', () => {
  it('renders the key value and warning', () => {
    render(<NewKeyModal result={RESULT} onClose={jest.fn()} />)
    expect(screen.getByTestId('new-key-modal')).toBeInTheDocument()
    expect(screen.getByTestId('new-key-value')).toHaveValue(RESULT.key)
    expect(screen.getByText(/will not be shown again/i)).toBeInTheDocument()
  })

  it('copies key to clipboard when copy button is clicked', async () => {
    render(<NewKeyModal result={RESULT} onClose={jest.fn()} />)
    fireEvent.click(screen.getByTestId('copy-key-button'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(RESULT.key)
  })

  it('calls onClose when confirm button is clicked', () => {
    const onClose = jest.fn()
    render(<NewKeyModal result={RESULT} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('confirm-copied-button'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not show Copied! when clipboard write fails', async () => {
    ;(navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(new Error('denied'))
    render(<NewKeyModal result={RESULT} onClose={jest.fn()} />)
    fireEvent.click(screen.getByTestId('copy-key-button'))
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument()
  })

  it('shows label and hint', () => {
    render(<NewKeyModal result={RESULT} onClose={jest.fn()} />)
    expect(screen.getByText('ci-runner')).toBeInTheDocument()
    expect(screen.getByText(/····aaaa/)).toBeInTheDocument()
  })
})
