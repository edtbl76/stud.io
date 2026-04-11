import { computeDiff, formatDiffValue } from '@/lib/computeDiff'

describe('computeDiff', () => {
  it('returns only changed fields', () => {
    const result = computeDiff(
      { name: 'Reverb', version: '1.0' },
      { name: 'Reverb', version: '2.0' },
    )
    expect(result).toEqual([{ field: 'version', from: '1.0', to: '2.0' }])
  })

  it('excludes updated_at and created_at', () => {
    const result = computeDiff(
      { name: 'Reverb', updated_at: '2026-01-01', created_at: '2025-01-01' },
      { name: 'Reverb', updated_at: '2026-02-01', created_at: '2025-01-01' },
    )
    expect(result).toHaveLength(0)
  })

  it('handles keys present in old but missing from new', () => {
    const result = computeDiff(
      { name: 'Reverb', description: 'old desc' },
      { name: 'Reverb' },
    )
    expect(result).toEqual([{ field: 'description', from: 'old desc', to: undefined }])
  })

  it('handles keys present in new but missing from old', () => {
    const result = computeDiff(
      { name: 'Reverb' },
      { name: 'Reverb', version: '1.0' },
    )
    expect(result).toEqual([{ field: 'version', from: undefined, to: '1.0' }])
  })

  it('returns empty array when nothing changed', () => {
    const result = computeDiff({ name: 'Reverb' }, { name: 'Reverb' })
    expect(result).toHaveLength(0)
  })

  it('handles null values', () => {
    const result = computeDiff({ name: null }, { name: 'Reverb' })
    expect(result).toEqual([{ field: 'name', from: null, to: 'Reverb' }])
  })
})

describe('formatDiffValue', () => {
  it('truncates UUID strings to 8 chars', () => {
    expect(formatDiffValue('aaaaaaaa-0000-0000-0000-000000000001')).toBe('aaaaaaaa')
  })

  it('returns full non-UUID strings', () => {
    expect(formatDiffValue('Reverb')).toBe('Reverb')
  })

  it('renders null as em-dash', () => {
    expect(formatDiffValue(null)).toBe('—')
  })

  it('renders undefined as em-dash', () => {
    expect(formatDiffValue(undefined)).toBe('—')
  })

  it('JSON-stringifies non-string values', () => {
    expect(formatDiffValue(42)).toBe('42')
    expect(formatDiffValue(true)).toBe('true')
    expect(formatDiffValue({ a: 1 })).toBe('{"a":1}')
  })
})
