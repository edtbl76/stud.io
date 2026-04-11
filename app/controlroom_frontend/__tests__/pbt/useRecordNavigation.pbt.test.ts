import * as fc from 'fast-check'
import { renderHook } from '@testing-library/react'
import { useRecordNavigation } from '@/lib/useRecordNavigation'

// ── Strategies ────────────────────────────────────────────────────────────────

interface Item {
  id: string
  name: string
}

const getId = (r: Item) => r.id

// Non-empty array of items with unique ids.
const nonEmptyDataArb = fc
  .array(fc.uuid(), { minLength: 1, maxLength: 50 })
  .map((ids) => [...new Set(ids)])
  .filter((ids) => ids.length > 0)
  .map((ids) => ids.map((id, i) => ({ id, name: `Item ${i}` })))

// ── Invariants ────────────────────────────────────────────────────────────────

describe('useRecordNavigation — properties', () => {
  it('hasPrev is true iff index > 0', () => {
    fc.assert(
      fc.property(nonEmptyDataArb, fc.nat(), (data, pick) => {
        const i = pick % data.length
        const { result } = renderHook(() =>
          useRecordNavigation({ data, currentRecord: data[i], getRecordId: getId, onNavigate: () => {} }),
        )
        const nav = result.current
        if (nav === null) return  // record not found — skip
        expect(nav.hasPrev).toBe(nav.index > 0)
      }),
    )
  })

  it('hasNext is true iff index < total - 1', () => {
    fc.assert(
      fc.property(nonEmptyDataArb, fc.nat(), (data, pick) => {
        const i = pick % data.length
        const { result } = renderHook(() =>
          useRecordNavigation({ data, currentRecord: data[i], getRecordId: getId, onNavigate: () => {} }),
        )
        const nav = result.current
        if (nav === null) return
        expect(nav.hasNext).toBe(nav.index < nav.total - 1)
      }),
    )
  })

  it('index is always in [0, total - 1] when not null', () => {
    fc.assert(
      fc.property(nonEmptyDataArb, fc.nat(), (data, pick) => {
        const i = pick % data.length
        const { result } = renderHook(() =>
          useRecordNavigation({ data, currentRecord: data[i], getRecordId: getId, onNavigate: () => {} }),
        )
        const nav = result.current
        if (nav === null) return
        expect(nav.index).toBeGreaterThanOrEqual(0)
        expect(nav.index).toBeLessThan(nav.total)
      }),
    )
  })

  it('total always equals data.length', () => {
    fc.assert(
      fc.property(nonEmptyDataArb, fc.nat(), (data, pick) => {
        const i = pick % data.length
        const { result } = renderHook(() =>
          useRecordNavigation({ data, currentRecord: data[i], getRecordId: getId, onNavigate: () => {} }),
        )
        const nav = result.current
        if (nav === null) return
        expect(nav.total).toBe(data.length)
      }),
    )
  })

  it('record not in data always returns null', () => {
    fc.assert(
      fc.property(nonEmptyDataArb, (data) => {
        const stranger: Item = { id: 'definitely-not-present', name: 'Stranger' }
        const { result } = renderHook(() =>
          useRecordNavigation({ data, currentRecord: stranger, getRecordId: getId, onNavigate: () => {} }),
        )
        expect(result.current).toBeNull()
      }),
    )
  })

  it('null currentRecord always returns null', () => {
    fc.assert(
      fc.property(nonEmptyDataArb, (data) => {
        const { result } = renderHook(() =>
          useRecordNavigation({ data, currentRecord: null, getRecordId: getId, onNavigate: () => {} }),
        )
        expect(result.current).toBeNull()
      }),
    )
  })

  it('onPrev calls onNavigate with data[index - 1] when hasPrev', () => {
    fc.assert(
      fc.property(
        nonEmptyDataArb.filter((d) => d.length > 1),
        fc.nat(),
        (data, pick) => {
          // Pick an index that is NOT the first element
          const i = (pick % (data.length - 1)) + 1
          const navigated: Item[] = []
          const { result } = renderHook(() =>
            useRecordNavigation({
              data,
              currentRecord: data[i],
              getRecordId: getId,
              onNavigate: (r) => navigated.push(r),
            }),
          )
          result.current?.onPrev()
          expect(navigated).toHaveLength(1)
          expect(navigated[0].id).toBe(data[i - 1].id)
        },
      ),
    )
  })

  it('onNext calls onNavigate with data[index + 1] when hasNext', () => {
    fc.assert(
      fc.property(
        nonEmptyDataArb.filter((d) => d.length > 1),
        fc.nat(),
        (data, pick) => {
          // Pick an index that is NOT the last element
          const i = pick % (data.length - 1)
          const navigated: Item[] = []
          const { result } = renderHook(() =>
            useRecordNavigation({
              data,
              currentRecord: data[i],
              getRecordId: getId,
              onNavigate: (r) => navigated.push(r),
            }),
          )
          result.current?.onNext()
          expect(navigated).toHaveLength(1)
          expect(navigated[0].id).toBe(data[i + 1].id)
        },
      ),
    )
  })

  it('hasPrev=false always means onPrev never calls onNavigate', () => {
    fc.assert(
      fc.property(nonEmptyDataArb, (data) => {
        const navigated: Item[] = []
        const { result } = renderHook(() =>
          useRecordNavigation({
            data,
            currentRecord: data[0],
            getRecordId: getId,
            onNavigate: (r) => navigated.push(r),
          }),
        )
        result.current?.onPrev()
        expect(navigated).toHaveLength(0)
      }),
    )
  })

  it('hasNext=false always means onNext never calls onNavigate', () => {
    fc.assert(
      fc.property(nonEmptyDataArb, (data) => {
        const navigated: Item[] = []
        const last = data[data.length - 1]
        const { result } = renderHook(() =>
          useRecordNavigation({
            data,
            currentRecord: last,
            getRecordId: getId,
            onNavigate: (r) => navigated.push(r),
          }),
        )
        result.current?.onNext()
        expect(navigated).toHaveLength(0)
      }),
    )
  })
})
