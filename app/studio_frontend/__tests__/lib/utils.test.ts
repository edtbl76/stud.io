import { cn, formatSlug, formatDate } from '../../lib/utils'

describe('formatDate()', () => {
  const opts = { month: 'short', day: 'numeric', year: 'numeric' } as const

  it.each([
    '2026-11-10T21:33:50Z',
    '2024-02-29T00:00:00Z',
    '1999-12-31T23:59:59.999Z',
    '2026-01-01',
  ])('formats %s exactly as toLocaleDateString(en-US, short) did', (iso) => {
    expect(formatDate(iso)).toBe(new Date(iso).toLocaleDateString('en-US', opts))
  })

  it('keeps the old output for an unparseable date instead of throwing', () => {
    expect(formatDate('not-a-date')).toBe('Invalid Date')
  })

  // 2026-11-10: a new Intl.DateTimeFormat per table cell was the top self-time function on the TablePage pages under
  // Lighthouse's 4x CPU throttle (stud.io CI #19/#22 TBT over 200ms). The formatter must be built once, not per call.
  // (toLocaleDateString builds its formatter internally, invisible to a spy, so the check is that the module builds
  // exactly ONE formatter when it loads and none per call.)
  it('builds one Intl.DateTimeFormat at module load and reuses it', () => {
    const spy = jest.spyOn(Intl, 'DateTimeFormat')
    jest.isolateModules(() => {
      const fresh: typeof import('../../lib/utils') = require('../../lib/utils')
      for (let i = 0; i < 50; i++) fresh.formatDate('2026-11-10T21:33:50Z')
    })
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})

describe('cn()', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles falsy values', () => {
    expect(cn('foo', undefined, null, false, '')).toBe('foo')
  })

  it('resolves tailwind conflicts — last padding wins', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('returns empty string when no args', () => {
    expect(cn()).toBe('')
  })
})

describe('formatSlug()', () => {
  it('capitalises a single word', () => {
    expect(formatSlug('guitar')).toBe('Guitar')
  })

  it('joins multi-word slug with spaces and capitalises each word', () => {
    expect(formatSlug('electric-guitar')).toBe('Electric Guitar')
  })

  it('handles three-part slug', () => {
    expect(formatSlug('studio-reference-monitor')).toBe('Studio Reference Monitor')
  })
})
