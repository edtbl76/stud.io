export const FILTER_OPERATORS = [
  'contains',
  'equals',
  'fuzzy',
  'is_empty',
  'is_not_empty',
  'date_on',
  'date_before',
  'date_after',
  'date_between',
] as const

export type FilterOperator = (typeof FILTER_OPERATORS)[number]

export const DEFAULT_OPERATOR: FilterOperator = 'contains'

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains:     'contains',
  equals:       'equals',
  fuzzy:        'fuzzy',
  is_empty:     'is empty',
  is_not_empty: 'is not empty',
  date_on:      'on',
  date_before:  'before',
  date_after:   'after',
  date_between: 'between',
}

export const VALUE_FREE_OPERATORS = new Set<FilterOperator>(['is_empty', 'is_not_empty'])
export const DATE_OPERATORS = new Set<FilterOperator>(['date_on', 'date_before', 'date_after', 'date_between'])
export const DATE_RANGE_OPERATORS = new Set<FilterOperator>(['date_between'])

/** Operator sets for column meta — imported by column definition files */
export const TEXT_FILTER_OPERATORS: FilterOperator[] = ['contains', 'equals', 'fuzzy', 'is_empty', 'is_not_empty']
export const ARRAY_FILTER_OPERATORS: FilterOperator[] = ['contains', 'is_empty', 'is_not_empty']
export const DATE_FILTER_OPERATORS: FilterOperator[] = ['date_on', 'date_before', 'date_after', 'date_between']

export interface FilterEntry {
  value: string
  operator: FilterOperator
  value_end?: string  // second bound for date_between
}

export type FilterState = Record<string, FilterEntry>
