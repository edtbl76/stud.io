import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { FieldRow } from '@/components/FieldRow'

describe('FieldRow', () => {
  it('renders the label', () => {
    render(<FieldRow label="Brand" value="Arturia" />)
    expect(screen.getByText('Brand')).toBeInTheDocument()
  })

  it('renders the value when provided', () => {
    render(<FieldRow label="Brand" value="Arturia" />)
    expect(screen.getByText('Arturia')).toBeInTheDocument()
  })

  it('renders a dash when value is null', () => {
    render(<FieldRow label="Notes" value={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a dash when value is undefined', () => {
    render(<FieldRow label="Notes" value={undefined} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a dash when value is empty string', () => {
    render(<FieldRow label="Notes" value="" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a dash when value is empty array', () => {
    render(<FieldRow label="Tags" value={[]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders ReactNode value (e.g. a badge element)', () => {
    render(<FieldRow label="Types" value={<span data-testid="badge">Reverb</span>} />)
    expect(screen.getByTestId('badge')).toBeInTheDocument()
  })
})
