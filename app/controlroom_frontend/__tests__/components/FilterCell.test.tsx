import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterCell } from '@/components/FilterCell'
import type { FilterEntry, FilterOperator } from '@/lib/filterOperators'

const ALL_OPS: FilterOperator[] = ['contains', 'equals', 'fuzzy', 'is_empty', 'is_not_empty']

function openPopover() {
  fireEvent.click(screen.getByLabelText('Filter operator'))
}

describe('FilterCell', () => {
  it('renders filter icon button and text input by default', () => {
    render(
      <FilterCell
        colId="name"
        entry={undefined}
        onEntryChange={jest.fn()}
      />
    )
    expect(screen.getByLabelText('Filter operator')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('2+ chars…')).toBeInTheDocument()
  })

  it('renders only text input when filterOperators has one item', () => {
    render(
      <FilterCell
        colId="types"
        entry={undefined}
        filterOperators={['contains']}
        onEntryChange={jest.fn()}
      />
    )
    expect(screen.queryByLabelText('Filter operator')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('2+ chars…')).toBeInTheDocument()
  })

  it('shows current value in text input', () => {
    const entry: FilterEntry = { value: 'moog', operator: 'contains' }
    render(
      <FilterCell colId="name" entry={entry} onEntryChange={jest.fn()} />
    )
    expect((screen.getByPlaceholderText('2+ chars…') as HTMLInputElement).value).toBe('moog')
  })

  it('calls onEntryChange with new entry on text input change', () => {
    const onChange = jest.fn()
    render(
      <FilterCell colId="name" entry={undefined} onEntryChange={onChange} />
    )
    fireEvent.change(screen.getByPlaceholderText('2+ chars…'), { target: { value: 'ssl' } })
    expect(onChange).toHaveBeenCalledWith('name', { value: 'ssl', operator: 'contains' })
  })

  it('calls onEntryChange with null when text input is cleared', () => {
    const onChange = jest.fn()
    const entry: FilterEntry = { value: 'ssl', operator: 'contains' }
    render(
      <FilterCell colId="name" entry={entry} onEntryChange={onChange} />
    )
    fireEvent.change(screen.getByPlaceholderText('2+ chars…'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('name', null)
  })

  it('shows clear button only when there is an active filter', () => {
    const { rerender } = render(
      <FilterCell colId="name" entry={undefined} onEntryChange={jest.fn()} />
    )
    expect(screen.queryByLabelText('Clear filter')).not.toBeInTheDocument()

    rerender(
      <FilterCell
        colId="name"
        entry={{ value: 'ssl', operator: 'contains' }}
        onEntryChange={jest.fn()}
      />
    )
    expect(screen.getByLabelText('Clear filter')).toBeInTheDocument()
  })

  it('calls onEntryChange(null) when clear button is clicked', () => {
    const onChange = jest.fn()
    render(
      <FilterCell
        colId="name"
        entry={{ value: 'ssl', operator: 'contains' }}
        onEntryChange={onChange}
      />
    )
    fireEvent.click(screen.getByLabelText('Clear filter'))
    expect(onChange).toHaveBeenCalledWith('name', null)
  })

  it('opens operator popover when filter icon is clicked', () => {
    render(
      <FilterCell
        colId="name"
        entry={undefined}
        filterOperators={ALL_OPS}
        onEntryChange={jest.fn()}
      />
    )
    openPopover()
    expect(screen.getByText('is empty')).toBeInTheDocument()
    expect(screen.getByText('is not empty')).toBeInTheDocument()
  })

  it('hides text input for is_empty operator', () => {
    render(
      <FilterCell
        colId="version"
        entry={{ value: '', operator: 'is_empty' }}
        filterOperators={ALL_OPS}
        onEntryChange={jest.fn()}
      />
    )
    expect(screen.queryByPlaceholderText('2+ chars…')).not.toBeInTheDocument()
  })

  it('hides text input for is_not_empty operator', () => {
    render(
      <FilterCell
        colId="version"
        entry={{ value: '', operator: 'is_not_empty' }}
        filterOperators={ALL_OPS}
        onEntryChange={jest.fn()}
      />
    )
    expect(screen.queryByPlaceholderText('2+ chars…')).not.toBeInTheDocument()
  })

  it('switches to value-free entry when operator changes to is_empty', () => {
    const onChange = jest.fn()
    render(
      <FilterCell
        colId="version"
        entry={{ value: '2.0', operator: 'contains' }}
        filterOperators={ALL_OPS}
        onEntryChange={onChange}
      />
    )
    openPopover()
    fireEvent.click(screen.getByText('is empty'))
    expect(onChange).toHaveBeenCalledWith('version', { value: '', operator: 'is_empty' })
  })

  it('switches operator for value-bearing operators, preserving value', () => {
    const onChange = jest.fn()
    render(
      <FilterCell
        colId="name"
        entry={{ value: 'ssl', operator: 'contains' }}
        filterOperators={ALL_OPS}
        onEntryChange={onChange}
      />
    )
    openPopover()
    fireEvent.click(screen.getByText('equals'))
    expect(onChange).toHaveBeenCalledWith('name', { value: 'ssl', operator: 'equals' })
  })
})
