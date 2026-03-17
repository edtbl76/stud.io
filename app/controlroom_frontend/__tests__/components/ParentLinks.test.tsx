import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { ParentLinks } from '@/components/ParentLinks'
import type { ParentRef } from '@/lib/types'

describe('ParentLinks', () => {
  it('renders a dash when parents is null', () => {
    render(<ParentLinks parents={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a dash when parents is undefined', () => {
    render(<ParentLinks parents={undefined} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a dash when parents is empty', () => {
    render(<ParentLinks parents={[]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders parent name when available', () => {
    const parents: ParentRef[] = [{ table_name: 'instruments', id: 'abc-123', name: 'Moog One' }]
    render(<ParentLinks parents={parents} />)
    expect(screen.getByText('Moog One')).toBeInTheDocument()
    expect(screen.getByText('instruments:')).toBeInTheDocument()
  })

  it('falls back to id when name is null', () => {
    const parents: ParentRef[] = [{ table_name: 'effects', id: 'xyz-456', name: null }]
    render(<ParentLinks parents={parents} />)
    expect(screen.getByText('xyz-456')).toBeInTheDocument()
    expect(screen.getByText('effects:')).toBeInTheDocument()
  })

  it('renders multiple parents', () => {
    const parents: ParentRef[] = [
      { table_name: 'instruments', id: '1', name: 'Moog One' },
      { table_name: 'libraries', id: '2', name: 'Spitfire LABS' },
    ]
    render(<ParentLinks parents={parents} />)
    expect(screen.getByText('Moog One')).toBeInTheDocument()
    expect(screen.getByText('Spitfire LABS')).toBeInTheDocument()
  })
})
