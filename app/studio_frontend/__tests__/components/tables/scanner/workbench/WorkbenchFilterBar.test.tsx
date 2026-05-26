import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkbenchFilterBar } from '@/components/tables/scanner/workbench/WorkbenchFilterBar'
import type { WorkbenchClientFilters } from '@/lib/types'

const BLANK_FILTERS: WorkbenchClientFilters = {
  bucket: '',
  needs_review_substate: '',
  catalog_type: '',
  format: '',
}

// Step 37
it('renders Catalog Type, Bucket, and Format selects', () => {
  render(<WorkbenchFilterBar filters={BLANK_FILTERS} onFiltersChange={jest.fn()} />)
  expect(screen.getByRole('combobox', { name: /catalog type/i })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: /bucket/i })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: /format/i })).toBeInTheDocument()
})

// Step 38
it('bucket change calls onFiltersChange with bucket patch', () => {
  const onChange = jest.fn()
  render(<WorkbenchFilterBar filters={BLANK_FILTERS} onFiltersChange={onChange} />)
  fireEvent.change(screen.getByRole('combobox', { name: /bucket/i }), { target: { value: 'needs_review' } })
  expect(onChange).toHaveBeenCalledWith({ bucket: 'needs_review' })
})

// Step 39
it('sub-state select is absent when bucket is not needs_review', () => {
  render(<WorkbenchFilterBar filters={BLANK_FILTERS} onFiltersChange={jest.fn()} />)
  expect(screen.queryByRole('combobox', { name: /sub.?state/i })).not.toBeInTheDocument()
})

it('sub-state select is present when bucket is needs_review', () => {
  render(
    <WorkbenchFilterBar
      filters={{ ...BLANK_FILTERS, bucket: 'needs_review' }}
      onFiltersChange={jest.fn()}
    />
  )
  expect(screen.getByRole('combobox', { name: /sub.?state/i })).toBeInTheDocument()
})

// Step 40
it('catalog type change calls onFiltersChange with catalog_type patch', () => {
  const onChange = jest.fn()
  render(<WorkbenchFilterBar filters={BLANK_FILTERS} onFiltersChange={onChange} />)
  fireEvent.change(screen.getByRole('combobox', { name: /catalog type/i }), { target: { value: 'effects' } })
  expect(onChange).toHaveBeenCalledWith({ catalog_type: 'effects' })
})

it('format change calls onFiltersChange with format patch', () => {
  const onChange = jest.fn()
  render(<WorkbenchFilterBar filters={BLANK_FILTERS} onFiltersChange={onChange} />)
  fireEvent.change(screen.getByRole('combobox', { name: /format/i }), { target: { value: 'VST3' } })
  expect(onChange).toHaveBeenCalledWith({ format: 'VST3' })
})

// Step 41
it('Reset button calls onFiltersChange with all-blank filters', () => {
  const onChange = jest.fn()
  render(
    <WorkbenchFilterBar
      filters={{ bucket: 'needs_review', needs_review_substate: 'collision', catalog_type: 'effects', format: 'VST3' }}
      onFiltersChange={onChange}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: /reset/i }))
  expect(onChange).toHaveBeenCalledWith({
    bucket: '',
    needs_review_substate: '',
    catalog_type: '',
    format: '',
  })
})
