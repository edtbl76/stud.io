import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { TypeBadges } from '@/components/TypeBadges'
import type { TypeRef } from '@/lib/types'

const types: TypeRef[] = [
  { id: '1', name: 'Reverb' },
  { id: '2', name: 'Delay' },
  { id: '3', name: 'Chorus' },
]

describe('TypeBadges', () => {
  it('renders a dash when types is null', () => {
    render(<TypeBadges types={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a dash when types is undefined', () => {
    render(<TypeBadges types={undefined} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a dash when types is empty', () => {
    render(<TypeBadges types={[]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders all badges when no limit', () => {
    render(<TypeBadges types={types} />)
    expect(screen.getByText('Reverb')).toBeInTheDocument()
    expect(screen.getByText('Delay')).toBeInTheDocument()
    expect(screen.getByText('Chorus')).toBeInTheDocument()
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })

  it('limits displayed badges and shows overflow count', () => {
    render(<TypeBadges types={types} limit={2} />)
    expect(screen.getByText('Reverb')).toBeInTheDocument()
    expect(screen.getByText('Delay')).toBeInTheDocument()
    expect(screen.queryByText('Chorus')).not.toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('does not show overflow badge when limit equals type count', () => {
    render(<TypeBadges types={types} limit={3} />)
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })
})
