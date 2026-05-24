import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { BucketTag } from '@/components/tables/scanner/workbench/BucketTag'

// Step 34
it('renders primary bucket label', () => {
  render(<BucketTag bucket="needs_review" />)
  expect(screen.getByText('Needs Review')).toBeInTheDocument()
})

it('renders "Unlinked" for unlinked bucket', () => {
  render(<BucketTag bucket="unlinked" />)
  expect(screen.getByText('Unlinked')).toBeInTheDocument()
})

it('renders "Known" for known bucket', () => {
  render(<BucketTag bucket="known" />)
  expect(screen.getByText('Known')).toBeInTheDocument()
})

// Step 35
it('renders secondary sub-state pill when subState is provided', () => {
  render(<BucketTag bucket="needs_review" subState="version mismatch" />)
  expect(screen.getByText('version mismatch')).toBeInTheDocument()
})

it('renders collision sub-state pill', () => {
  render(<BucketTag bucket="needs_review" subState="collision" />)
  expect(screen.getByText('collision')).toBeInTheDocument()
})

// Step 36
it('renders only one pill when subState is absent', () => {
  const { container } = render(<BucketTag bucket="known" />)
  const pills = container.querySelectorAll('[data-testid^="bucket-tag-pill"]')
  expect(pills).toHaveLength(1)
})

it('renders two pills when subState is present', () => {
  const { container } = render(<BucketTag bucket="needs_review" subState="unconfirmed" />)
  const pills = container.querySelectorAll('[data-testid^="bucket-tag-pill"]')
  expect(pills).toHaveLength(2)
})
