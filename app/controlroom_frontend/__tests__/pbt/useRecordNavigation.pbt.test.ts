import * as fc from 'fast-check'
import { renderHook } from '@testing-library/react'
import { useRecordNavigation, type RecordNavigationValue } from '@/lib/useRecordNavigation'

// ── Strategies ────────────────────────────────────────────────────────────────

interface Item {
  id: string
  name: string
}

const getId = (r: Item) => r.id

const nonEmptyDataArb = fc
  .array(fc.uuid(), { minLength: 1, maxLength: 50 })
  .map((ids) => [...new Set(ids)])
  .filter((ids) => ids.length > 0)
  .map((ids) => ids.map((id, i) => ({ id, name: `Item ${i}` })))

const multiItemArb = nonEmptyDataArb.filter((d) => d.length > 1)

// ── Helpers ───────────────────────────────────────────────────────────────────

function runNav(
  data: Item[],
  currentRecord: Item | null,
  onNavigate: (r: Item) => void = () => {},
): RecordNavigationValue | null {
  const { result } = renderHook(() =>
    useRecordNavigation({ data, currentRecord, getRecordId: getId, onNavigate }),
  )
  return result.current
}

// Runs a property over a randomly picked record and its nav value.
// Skips cases where nav is null (record not found).
function forEachPickedNav(check: (nav: RecordNavigationValue, data: Item[], i: number) => void) {
  fc.assert(
    fc.property(nonEmptyDataArb, fc.nat(), (data, pick) => {
      const i = pick % data.length
      const nav = runNav(data, data[i])
      if (nav !== null) check(nav, data, i)
    }),
  )
}

// Runs runNav with a navigation collector and returns [nav, collected].
function collectNav(data: Item[], record: Item): [RecordNavigationValue | null, Item[]] {
  const collected: Item[] = []
  return [runNav(data, record, (r) => collected.push(r)), collected]
}

// ── Invariants ────────────────────────────────────────────────────────────────

describe('useRecordNavigation — properties', () => {
  it('hasPrev is true iff index > 0', () => {
    forEachPickedNav((nav) => { expect(nav.hasPrev).toBe(nav.index > 0) })
  })

  it('hasNext is true iff index < total - 1', () => {
    forEachPickedNav((nav) => { expect(nav.hasNext).toBe(nav.index < nav.total - 1) })
  })

  it('index is always in [0, total - 1] when not null', () => {
    forEachPickedNav((nav) => {
      expect(nav.index).toBeGreaterThanOrEqual(0)
      expect(nav.index).toBeLessThan(nav.total)
    })
  })

  it('total always equals data.length', () => {
    forEachPickedNav((nav, data) => { expect(nav.total).toBe(data.length) })
  })

  it('record not in data always returns null', () => {
    fc.assert(fc.property(nonEmptyDataArb, (data) => {
      expect(runNav(data, { id: 'definitely-not-present', name: 'Stranger' })).toBeNull()
    }))
  })

  it('null currentRecord always returns null', () => {
    fc.assert(fc.property(nonEmptyDataArb, (data) => {
      expect(runNav(data, null)).toBeNull()
    }))
  })

  it('onPrev navigates to data[index - 1]', () => {
    fc.assert(fc.property(multiItemArb, fc.nat(), (data, pick) => {
      const i = (pick % (data.length - 1)) + 1
      const [nav, collected] = collectNav(data, data[i])
      nav?.onPrev()
      expect(collected).toHaveLength(1)
      expect(collected[0].id).toBe(data[i - 1].id)
    }))
  })

  it('onNext navigates to data[index + 1]', () => {
    fc.assert(fc.property(multiItemArb, fc.nat(), (data, pick) => {
      const i = pick % (data.length - 1)
      const [nav, collected] = collectNav(data, data[i])
      nav?.onNext()
      expect(collected).toHaveLength(1)
      expect(collected[0].id).toBe(data[i + 1].id)
    }))
  })

  it('onPrev at first record is a no-op', () => {
    fc.assert(fc.property(nonEmptyDataArb, (data) => {
      const [nav, collected] = collectNav(data, data[0])
      nav?.onPrev()
      expect(collected).toHaveLength(0)
    }))
  })

  it('onNext at last record is a no-op', () => {
    fc.assert(fc.property(nonEmptyDataArb, (data) => {
      const [nav, collected] = collectNav(data, data[data.length - 1])
      nav?.onNext()
      expect(collected).toHaveLength(0)
    }))
  })
})
