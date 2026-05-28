import { CATALOG_ROUTES, catalogRecordPath } from '@/lib/catalogNavigation'

describe('CATALOG_ROUTES', () => {
  it('contains all expected catalog table keys', () => {
    const expected = [
      'effects', 'instruments', 'libraries', 'workstations',
      'workflow_tools', 'measurement_tools', 'reference_tools',
      'composition_tools', 'admin_tools', 'brands', 'models',
    ]
    for (const key of expected) {
      expect(CATALOG_ROUTES[key]).toBeDefined()
    }
  })

  it('all values are non-empty strings starting with /', () => {
    for (const path of Object.values(CATALOG_ROUTES)) {
      expect(typeof path).toBe('string')
      expect(path.startsWith('/')).toBe(true)
    }
  })
})

describe('catalogRecordPath', () => {
  it('returns path with ?open= for a known table key', () => {
    const result = catalogRecordPath('instruments', 'abc-123')
    expect(result).toBe('/controlroom/session/instruments?open=abc-123')
  })

  it('includes the id verbatim in the returned path', () => {
    const id = 'some-uuid-value'
    const result = catalogRecordPath('effects', id)
    expect(result).toContain(id)
  })

  it('always includes ?open= when table is known', () => {
    for (const key of Object.keys(CATALOG_ROUTES)) {
      const path = catalogRecordPath(key, 'test-id')
      expect(path).toContain('?open=')
    }
  })

  it('returns null for an unrecognized table key', () => {
    expect(catalogRecordPath('unknown_table', 'abc')).toBeNull()
  })

  it('returns null for an empty string table key', () => {
    expect(catalogRecordPath('', 'abc')).toBeNull()
  })
})
