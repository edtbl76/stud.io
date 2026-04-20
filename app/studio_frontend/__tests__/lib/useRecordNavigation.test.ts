import { renderHook } from '@testing-library/react'
import { useRecordNavigation } from '@/lib/useRecordNavigation'

interface Item {
  id: string
  name: string
}

const getId = (r: Item) => r.id

const items: Item[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Gamma' },
]

function renderNav(data: Item[], current: Item | null, onNavigate = jest.fn()) {
  return renderHook(() =>
    useRecordNavigation({ data, currentRecord: current, getRecordId: getId, onNavigate }),
  )
}

describe('useRecordNavigation', () => {
  it('returns null when currentRecord is null', () => {
    const { result } = renderNav(items, null)
    expect(result.current).toBeNull()
  })

  it('returns null when currentRecord is not in data', () => {
    const { result } = renderNav(items, { id: 'z', name: 'Zed' })
    expect(result.current).toBeNull()
  })

  it('returns correct index for first record', () => {
    const { result } = renderNav(items, items[0])
    expect(result.current?.index).toBe(0)
  })

  it('returns correct index for middle record', () => {
    const { result } = renderNav(items, items[1])
    expect(result.current?.index).toBe(1)
  })

  it('returns correct index for last record', () => {
    const { result } = renderNav(items, items[2])
    expect(result.current?.index).toBe(2)
  })

  it('total equals data.length', () => {
    const { result } = renderNav(items, items[0])
    expect(result.current?.total).toBe(items.length)
  })

  it('hasPrev is false for first record', () => {
    const { result } = renderNav(items, items[0])
    expect(result.current?.hasPrev).toBe(false)
  })

  it('hasPrev is true for non-first record', () => {
    const { result } = renderNav(items, items[1])
    expect(result.current?.hasPrev).toBe(true)
  })

  it('hasNext is false for last record', () => {
    const { result } = renderNav(items, items[2])
    expect(result.current?.hasNext).toBe(false)
  })

  it('hasNext is true for non-last record', () => {
    const { result } = renderNav(items, items[1])
    expect(result.current?.hasNext).toBe(true)
  })

  it('onPrev calls onNavigate with previous record', () => {
    const onNavigate = jest.fn()
    const { result } = renderNav(items, items[1], onNavigate)
    result.current?.onPrev()
    expect(onNavigate).toHaveBeenCalledWith(items[0])
  })

  it('onNext calls onNavigate with next record', () => {
    const onNavigate = jest.fn()
    const { result } = renderNav(items, items[1], onNavigate)
    result.current?.onNext()
    expect(onNavigate).toHaveBeenCalledWith(items[2])
  })

  it('onPrev is a no-op on first record', () => {
    const onNavigate = jest.fn()
    const { result } = renderNav(items, items[0], onNavigate)
    result.current?.onPrev()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('onNext is a no-op on last record', () => {
    const onNavigate = jest.fn()
    const { result } = renderNav(items, items[2], onNavigate)
    result.current?.onNext()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('single-item list has hasPrev=false and hasNext=false', () => {
    const single = [items[0]]
    const { result } = renderNav(single, items[0])
    expect(result.current?.hasPrev).toBe(false)
    expect(result.current?.hasNext).toBe(false)
  })
})
