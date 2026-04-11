import * as fc from 'fast-check'
import { computeDiff, formatDiffValue } from '@/lib/computeDiff'

// ── Strategies ────────────────────────────────────────────────────────────────

const recordArb = fc.dictionary(
  fc.stringMatching(/^[a-z_][a-z0-9_]*$/),
  fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
  { minKeys: 0, maxKeys: 10 },
)

type Record = Parameters<typeof computeDiff>[0]
type Diff = ReturnType<typeof computeDiff>

// Runs an fc.property over two independent records and the diff between them.
function forEachDiff(check: (oldData: Record, newData: Record, diff: Diff) => void) {
  fc.assert(
    fc.property(recordArb, recordArb, (oldData, newData) => {
      check(oldData, newData, computeDiff(oldData, newData))
    }),
  )
}

// ── computeDiff ───────────────────────────────────────────────────────────────

describe('computeDiff — properties', () => {
  it('result fields are always a subset of all keys across both records', () => {
    forEachDiff((oldData, newData, diff) => {
      const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)])
      for (const entry of diff) {
        expect(allKeys.has(entry.field)).toBe(true)
      }
    })
  })

  it('updated_at and created_at never appear in the diff', () => {
    fc.assert(
      fc.property(recordArb, recordArb, (oldData, newData) => {
        const withTimestamps = { ...oldData, updated_at: '2024-01-01', created_at: '2024-01-01' }
        const diff = computeDiff(withTimestamps, newData)
        for (const entry of diff) {
          expect(entry.field).not.toBe('updated_at')
          expect(entry.field).not.toBe('created_at')
        }
      }),
    )
  })

  it('identical records always produce an empty diff', () => {
    fc.assert(
      fc.property(recordArb, (record) => {
        expect(computeDiff(record, record)).toHaveLength(0)
      }),
    )
  })

  it('each diff entry has from !== to (by JSON equality)', () => {
    forEachDiff((_oldData, _newData, diff) => {
      for (const entry of diff) {
        expect(JSON.stringify(entry.from)).not.toBe(JSON.stringify(entry.to))
      }
    })
  })

  it('from value always matches old record for that field', () => {
    forEachDiff((oldData, _newData, diff) => {
      for (const entry of diff) {
        expect(JSON.stringify(entry.from)).toBe(JSON.stringify(oldData[entry.field]))
      }
    })
  })

  it('to value always matches new record for that field', () => {
    forEachDiff((_oldData, newData, diff) => {
      for (const entry of diff) {
        expect(JSON.stringify(entry.to)).toBe(JSON.stringify(newData[entry.field]))
      }
    })
  })

  it('no duplicate fields in the diff', () => {
    forEachDiff((_oldData, _newData, diff) => {
      const fields = diff.map((e) => e.field)
      expect(fields.length).toBe(new Set(fields).size)
    })
  })
})

// ── formatDiffValue ───────────────────────────────────────────────────────────

const uuidArb = fc.uuid()

describe('formatDiffValue — properties', () => {
  it('null and undefined always return the em dash', () => {
    expect(formatDiffValue(null)).toBe('—')
    expect(formatDiffValue(undefined)).toBe('—')
  })

  it('UUIDs are always truncated to exactly 8 characters', () => {
    fc.assert(
      fc.property(uuidArb, (uuid) => {
        expect(formatDiffValue(uuid)).toHaveLength(8)
      }),
    )
  })

  it('non-UUID strings are returned as-is', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !/^[0-9a-f-]{36}$/i.test(s)),
        (s) => {
          expect(formatDiffValue(s)).toBe(s)
        },
      ),
    )
  })

  it('non-string non-null values always produce a non-empty string', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.float(), fc.boolean(), fc.array(fc.string())),
        (val) => {
          const result = formatDiffValue(val)
          expect(typeof result).toBe('string')
          expect(result.length).toBeGreaterThan(0)
        },
      ),
    )
  })
})
