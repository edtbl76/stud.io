import { renderHook, act } from '@testing-library/react'
import { useSessionState } from '@/lib/useSessionState'
import { ColumnDef } from '@tanstack/react-table'

const STORAGE_PREFIX = 'cr:'

const columns: ColumnDef<unknown, unknown>[] = [
  { accessorKey: 'name', header: 'Name' } as ColumnDef<unknown, unknown>,
  { id: 'hidden', header: 'Hidden', meta: { defaultHidden: true } } as ColumnDef<unknown, unknown>,
]

function storageKey(username: string, queryKey: string) {
  return `${STORAGE_PREFIX}${username}:${queryKey}`
}

function makeHook(defaultSort?: string) {
  return renderHook(() =>
    useSessionState({ username: 'alice', queryKey: 'effects', defaultSort }, columns),
  )
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { localStorage.clear() })

describe('useSessionState — defaults', () => {
  it('initialises externalSorting from defaultSort', () => {
    const { result } = makeHook('effect_name')
    expect(result.current.externalSorting).toEqual([{ id: 'effect_name', desc: false }])
  })

  it('initialises with empty sorting when no defaultSort', () => {
    const { result } = makeHook()
    expect(result.current.externalSorting).toEqual([])
  })

  it('initialises columnVisibility with defaultHidden columns hidden', () => {
    const { result } = makeHook()
    expect(result.current.columnVisibility).toMatchObject({ hidden: false })
  })

  it('starts with empty filters and sizing', () => {
    const { result } = makeHook()
    expect(result.current.inputFilters).toEqual({})
    expect(result.current.activeFilters).toEqual({})
    expect(result.current.columnSizing).toEqual({})
  })
})

describe('useSessionState — isDirty', () => {
  it('is false on default state', () => {
    const { result } = makeHook('effect_name')
    expect(result.current.isDirty).toBe(false)
  })

  it('is true when a filter is active', () => {
    const { result } = makeHook('effect_name')
    act(() => {
      result.current.setFilterEntry('name', { value: 'test', operator: 'contains' })
    })
    expect(result.current.isDirty).toBe(true)
  })

  it('is true when sorting differs from default', () => {
    const { result } = makeHook('effect_name')
    act(() => {
      result.current.setExternalSorting([{ id: 'other', desc: true }])
    })
    expect(result.current.isDirty).toBe(true)
  })

  it('is true when column sizing is customised', () => {
    const { result } = makeHook()
    act(() => {
      result.current.setColumnSizing({ name: 300 })
    })
    expect(result.current.isDirty).toBe(true)
  })

  it('is true when a default-hidden column is made visible', () => {
    const { result } = makeHook()
    act(() => {
      result.current.setColumnVisibility({ hidden: true })
    })
    expect(result.current.isDirty).toBe(true)
  })
})

describe('useSessionState — persistence', () => {
  it('persists sorting to localStorage', () => {
    const key = storageKey('alice', 'effects')
    const { result } = makeHook('effect_name')
    act(() => {
      result.current.setExternalSorting([{ id: 'name', desc: true }])
    })
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}')
    expect(stored.sorting).toEqual([{ id: 'name', desc: true }])
  })

  it('persists column sizing to localStorage', () => {
    const key = storageKey('alice', 'effects')
    const { result } = makeHook()
    act(() => {
      result.current.setColumnSizing({ name: 250 })
    })
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}')
    expect(stored.sizing).toEqual({ name: 250 })
  })

  it('restores state from localStorage on mount', () => {
    const key = storageKey('alice', 'effects')
    localStorage.setItem(key, JSON.stringify({
      sorting: [{ id: 'name', desc: true }],
      sizing: { name: 250 },
      filters: {},
      visibility: {},
    }))
    const { result } = makeHook('effect_name')
    expect(result.current.externalSorting).toEqual([{ id: 'name', desc: true }])
    expect(result.current.columnSizing).toEqual({ name: 250 })
  })

  it('isolates storage by username and queryKey', () => {
    const { result: alice } = makeHook()
    const { result: bob } = renderHook(() =>
      useSessionState({ username: 'bob', queryKey: 'effects' }, columns),
    )
    act(() => {
      alice.current.setExternalSorting([{ id: 'name', desc: false }])
    })
    expect(bob.current.externalSorting).toEqual([])
  })
})

describe('useSessionState — resetView', () => {
  it('resets all state to defaults', () => {
    const { result } = makeHook('effect_name')
    act(() => {
      result.current.setFilterEntry('name', { value: 'test', operator: 'contains' })
      result.current.setExternalSorting([{ id: 'name', desc: true }])
      result.current.setColumnSizing({ name: 300 })
    })
    expect(result.current.isDirty).toBe(true)

    act(() => { result.current.resetView() })

    expect(result.current.inputFilters).toEqual({})
    expect(result.current.externalSorting).toEqual([{ id: 'effect_name', desc: false }])
    expect(result.current.columnSizing).toEqual({})
    expect(result.current.isDirty).toBe(false)
  })

  it('clears localStorage on reset', () => {
    const key = storageKey('alice', 'effects')
    const { result } = makeHook()
    act(() => { result.current.setExternalSorting([{ id: 'name', desc: true }]) })
    expect(localStorage.getItem(key)).not.toBeNull()

    act(() => { result.current.resetView() })
    expect(localStorage.getItem(key)).toBeNull()
  })
})

describe('useSessionState — filter debounce', () => {
  beforeEach(() => { jest.useFakeTimers() })
  afterEach(() => { jest.useRealTimers() })

  it('does not activate filter until debounce fires', () => {
    const { result } = makeHook()
    act(() => {
      result.current.setFilterEntry('name', { value: 'abc', operator: 'contains' })
    })
    expect(result.current.activeFilters).toEqual({})

    act(() => { jest.advanceTimersByTime(350) })
    expect(result.current.activeFilters).toMatchObject({ name: { value: 'abc' } })
  })

  it('does not activate filters shorter than 2 chars', () => {
    const { result } = makeHook()
    act(() => {
      result.current.setFilterEntry('name', { value: 'a', operator: 'contains' })
    })
    act(() => { jest.advanceTimersByTime(350) })
    expect(result.current.activeFilters).toEqual({})
  })
})
