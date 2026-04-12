import * as fc from 'fast-check'
import { loadRecents, pushRecent } from '@/lib/parentSelectRecents'
import type { ParentRef } from '@/lib/types'

const TABLE_NAMES = ['effects', 'instruments', 'libraries'] as const

const parentRefArb: fc.Arbitrary<ParentRef> = fc.record({
  table_name: fc.constantFrom(...TABLE_NAMES),
  id: fc.uuid(),
  name: fc.oneof(fc.string({ minLength: 1, maxLength: 40 }), fc.constant(null)),
})

describe('parentSelectRecents — properties', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('list never exceeds MAX_RECENTS regardless of how many entries are pushed', () => {
    fc.assert(
      fc.property(fc.array(parentRefArb, { minLength: 1, maxLength: 30 }), (refs) => {
        localStorage.clear()
        refs.forEach(r => pushRecent(r))
        expect(loadRecents().length).toBeLessThanOrEqual(10)
      })
    )
  })

  it('most recently pushed entry is always at index 0', () => {
    fc.assert(
      fc.property(fc.array(parentRefArb, { minLength: 0, maxLength: 15 }), parentRefArb, (prior, last) => {
        localStorage.clear()
        prior.forEach(r => pushRecent(r))
        pushRecent(last)
        const recents = loadRecents()
        expect(recents[0].table_name).toBe(last.table_name)
        expect(recents[0].id).toBe(last.id)
      })
    )
  })

  it('pushing the same ref twice leaves exactly one copy', () => {
    fc.assert(
      fc.property(parentRefArb, (ref) => {
        localStorage.clear()
        pushRecent(ref)
        pushRecent(ref)
        const count = loadRecents().filter(r => r.table_name === ref.table_name && r.id === ref.id).length
        expect(count).toBe(1)
      })
    )
  })

  it('re-pushing an existing entry moves it to the front and removes the older copy', () => {
    fc.assert(
      fc.property(
        fc.array(parentRefArb, { minLength: 1, maxLength: 8 }),
        parentRefArb,
        (prior, target) => {
          localStorage.clear()
          prior.forEach(r => pushRecent(r))
          pushRecent(target)
          pushRecent(target) // re-push same target
          const recents = loadRecents()
          const count = recents.filter(r => r.table_name === target.table_name && r.id === target.id).length
          expect(count).toBe(1)
          expect(recents[0].table_name).toBe(target.table_name)
          expect(recents[0].id).toBe(target.id)
        }
      )
    )
  })

  it('loadRecents returns empty array when storage is empty', () => {
    localStorage.clear()
    expect(loadRecents()).toEqual([])
  })

  it('loadRecents returns empty array on corrupt JSON', () => {
    localStorage.setItem('parentSelect_recents', '{not valid json[')
    expect(loadRecents()).toEqual([])
  })

  it('loadRecents returns empty array when storage contains a valid JSON object', () => {
    localStorage.setItem('parentSelect_recents', '{}')
    expect(loadRecents()).toEqual([])
  })

  it('loadRecents returns empty array when storage contains a valid JSON number', () => {
    localStorage.setItem('parentSelect_recents', '123')
    expect(loadRecents()).toEqual([])
  })

  it('loadRecents returns empty array when storage contains a valid JSON string', () => {
    localStorage.setItem('parentSelect_recents', '"x"')
    expect(loadRecents()).toEqual([])
  })

  it('loadRecents filters out array items that are not valid ParentRef objects', () => {
    localStorage.setItem('parentSelect_recents', '[1, null, "bad", {}, {"table_name": "effects"}, {"id": "x"}, {"table_name": "effects", "id": "e-1"}]')
    const recents = loadRecents()
    expect(recents).toHaveLength(1)
    expect(recents[0].table_name).toBe('effects')
    expect(recents[0].id).toBe('e-1')
  })
})
