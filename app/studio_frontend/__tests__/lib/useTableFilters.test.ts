import { renderHook, act } from '@testing-library/react'
import { useTableFilters, makeDefaultEntry } from '@/lib/useTableFilters'

describe('useTableFilters', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('starts with empty inputFilters and activeFilters', () => {
    const { result } = renderHook(() => useTableFilters())
    expect(result.current.inputFilters).toEqual({})
    expect(result.current.activeFilters).toEqual({})
  })

  it('setFilterEntry adds entry to inputFilters immediately', () => {
    const { result } = renderHook(() => useTableFilters())
    act(() => {
      result.current.setFilterEntry('name', { value: 'ab', operator: 'contains' })
    })
    expect(result.current.inputFilters['name']).toEqual({ value: 'ab', operator: 'contains' })
  })

  it('does not update activeFilters before debounce completes', () => {
    const { result } = renderHook(() => useTableFilters())
    act(() => {
      result.current.setFilterEntry('name', { value: 'ab', operator: 'contains' })
    })
    expect(result.current.activeFilters['name']).toBeUndefined()
  })

  it('updates activeFilters after debounce delay', () => {
    const { result } = renderHook(() => useTableFilters())
    act(() => {
      result.current.setFilterEntry('name', { value: 'ab', operator: 'contains' })
    })
    act(() => { jest.advanceTimersByTime(350) })
    expect(result.current.activeFilters['name']).toEqual({ value: 'ab', operator: 'contains' })
  })

  it('excludes contains entries with value shorter than 2 chars', () => {
    const { result } = renderHook(() => useTableFilters())
    act(() => {
      result.current.setFilterEntry('name', { value: 'a', operator: 'contains' })
    })
    act(() => { jest.advanceTimersByTime(350) })
    expect(result.current.activeFilters['name']).toBeUndefined()
  })

  it('passes value-free operators through regardless of value length', () => {
    const { result } = renderHook(() => useTableFilters())
    act(() => {
      result.current.setFilterEntry('version', { value: '', operator: 'is_empty' })
    })
    act(() => { jest.advanceTimersByTime(350) })
    expect(result.current.activeFilters['version']).toEqual({ value: '', operator: 'is_empty' })
  })

  it('passes is_not_empty through', () => {
    const { result } = renderHook(() => useTableFilters())
    act(() => {
      result.current.setFilterEntry('version', { value: '', operator: 'is_not_empty' })
    })
    act(() => { jest.advanceTimersByTime(350) })
    expect(result.current.activeFilters['version']).toEqual({ value: '', operator: 'is_not_empty' })
  })

  it('bypasses 2-char minimum for quoted values', () => {
    const { result } = renderHook(() => useTableFilters())
    act(() => {
      result.current.setFilterEntry('name', { value: '"X"', operator: 'contains' })
    })
    act(() => { jest.advanceTimersByTime(350) })
    expect(result.current.activeFilters['name']).toEqual({ value: '"X"', operator: 'contains' })
  })

  it('setFilterEntry(key, null) removes the entry', () => {
    const { result } = renderHook(() => useTableFilters())
    act(() => {
      result.current.setFilterEntry('name', { value: 'ssl', operator: 'contains' })
    })
    act(() => {
      result.current.setFilterEntry('name', null)
    })
    expect(result.current.inputFilters['name']).toBeUndefined()
  })

  it('debounces: cancels previous timer when input changes quickly', () => {
    const { result } = renderHook(() => useTableFilters())
    act(() => {
      result.current.setFilterEntry('name', { value: 'ab', operator: 'contains' })
    })
    act(() => { jest.advanceTimersByTime(200) })
    act(() => {
      result.current.setFilterEntry('name', { value: 'abc', operator: 'contains' })
    })
    act(() => { jest.advanceTimersByTime(200) })
    expect(result.current.activeFilters['name']).toBeUndefined()
    act(() => { jest.advanceTimersByTime(150) })
    expect(result.current.activeFilters['name']).toEqual({ value: 'abc', operator: 'contains' })
  })

  it('clearFilters resets both inputFilters and activeFilters immediately', () => {
    const { result } = renderHook(() => useTableFilters())
    act(() => {
      result.current.setFilterEntry('name', { value: 'ab', operator: 'contains' })
    })
    act(() => { jest.advanceTimersByTime(350) })
    expect(result.current.activeFilters['name']).toBeDefined()
    act(() => { result.current.clearFilters() })
    expect(result.current.inputFilters).toEqual({})
    expect(result.current.activeFilters).toEqual({})
  })
})

describe('makeDefaultEntry', () => {
  it('creates a contains entry with the given value', () => {
    expect(makeDefaultEntry('ssl')).toEqual({ value: 'ssl', operator: 'contains' })
  })
})
