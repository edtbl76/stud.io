import { cn, formatSlug } from '../../lib/utils'

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
