import {
  FILTER_OPERATORS,
  DEFAULT_OPERATOR,
  VALUE_FREE_OPERATORS,
  DATE_OPERATORS,
  DATE_RANGE_OPERATORS,
  OPERATOR_LABELS,
} from '@/lib/filterOperators'
import type { FilterEntry, FilterState } from '@/lib/filterOperators'

describe('filterOperators', () => {
  it('exports all nine operators', () => {
    expect(FILTER_OPERATORS).toEqual([
      'contains', 'equals', 'fuzzy', 'is_empty', 'is_not_empty',
      'date_on', 'date_before', 'date_after', 'date_between',
    ])
  })

  it('default operator is contains', () => {
    expect(DEFAULT_OPERATOR).toBe('contains')
  })

  it('value-free operators include is_empty and is_not_empty only', () => {
    expect(VALUE_FREE_OPERATORS.has('is_empty')).toBe(true)
    expect(VALUE_FREE_OPERATORS.has('is_not_empty')).toBe(true)
    expect(VALUE_FREE_OPERATORS.has('contains')).toBe(false)
    expect(VALUE_FREE_OPERATORS.has('equals')).toBe(false)
    expect(VALUE_FREE_OPERATORS.has('fuzzy')).toBe(false)
    expect(VALUE_FREE_OPERATORS.has('date_on')).toBe(false)
  })

  it('date operators include all four date variants', () => {
    expect(DATE_OPERATORS.has('date_on')).toBe(true)
    expect(DATE_OPERATORS.has('date_before')).toBe(true)
    expect(DATE_OPERATORS.has('date_after')).toBe(true)
    expect(DATE_OPERATORS.has('date_between')).toBe(true)
    expect(DATE_OPERATORS.has('contains')).toBe(false)
  })

  it('date range operators include only date_between', () => {
    expect(DATE_RANGE_OPERATORS.has('date_between')).toBe(true)
    expect(DATE_RANGE_OPERATORS.has('date_on')).toBe(false)
  })

  it('operator labels exist for all operators', () => {
    for (const op of FILTER_OPERATORS) {
      expect(OPERATOR_LABELS[op]).toBeTruthy()
    }
  })

  it('FilterEntry type accepts text and date operators', () => {
    const entries: FilterEntry[] = [
      { value: 'ssl', operator: 'contains' },
      { value: 'Ableton', operator: 'equals' },
      { value: 'abelton', operator: 'fuzzy' },
      { value: '', operator: 'is_empty' },
      { value: '', operator: 'is_not_empty' },
      { value: '2024-01-01', operator: 'date_on' },
      { value: '2024-01-01', operator: 'date_before' },
      { value: '2024-01-01', operator: 'date_after' },
      { value: '2024-01-01', operator: 'date_between', value_end: '2024-12-31' },
    ]
    expect(entries).toHaveLength(9)
  })

  it('FilterState is a record of FilterEntry', () => {
    const state: FilterState = {
      name: { value: 'ssl', operator: 'contains' },
      version: { value: '', operator: 'is_empty' },
    }
    expect(Object.keys(state)).toHaveLength(2)
  })
})
