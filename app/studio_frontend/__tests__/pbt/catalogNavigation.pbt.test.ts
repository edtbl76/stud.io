import * as fc from 'fast-check'
import { catalogRecordPath, CATALOG_ROUTES } from '@/lib/catalogNavigation'

const knownKeys = Object.keys(CATALOG_ROUTES)

// Arbitrary that always produces a key NOT in CATALOG_ROUTES
const unknownTableArb = fc.string().filter(s => !knownKeys.includes(s))

describe('catalogRecordPath — known table invariants', () => {
  it('always returns a string containing ?open= for known table keys', () => {
    fc.assert(
      fc.property(fc.constantFrom(...knownKeys), fc.string(), (table, id) => {
        const result = catalogRecordPath(table, id)
        expect(result).not.toBeNull()
        expect(result).toContain('?open=')
      })
    )
  })

  it('always contains the id verbatim in the output path', () => {
    fc.assert(
      fc.property(fc.constantFrom(...knownKeys), fc.string(), (table, id) => {
        const result = catalogRecordPath(table, id)
        expect(result).toContain(id)
      })
    )
  })

  it('output always starts with /', () => {
    fc.assert(
      fc.property(fc.constantFrom(...knownKeys), fc.string(), (table, id) => {
        const result = catalogRecordPath(table, id)
        expect(result?.startsWith('/')).toBe(true)
      })
    )
  })
})

describe('catalogRecordPath — unknown table invariants', () => {
  it('returns null for any string not in CATALOG_ROUTES', () => {
    fc.assert(
      fc.property(unknownTableArb, fc.string(), (table, id) => {
        expect(catalogRecordPath(table, id)).toBeNull()
      })
    )
  })
})
