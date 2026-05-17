import { api } from '../../lib/api'
import type { FilterState } from '../../lib/filterOperators'

function mockFetch(status: number, body?: unknown) {
  const mock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body ?? {},
  } as Response)
  global.fetch = mock
  return mock
}

afterEach(() => {
  jest.restoreAllMocks()
})

const BASE = '/api'

describe('api.list', () => {
  it('calls correct URL with GET', async () => {
    const spy = mockFetch(200, [])
    await api.list('/instruments')
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/instruments`,
      expect.objectContaining({ headers: expect.any(Object) })
    )
  })

  it('appends ?q=encoded when query param provided', async () => {
    const spy = mockFetch(200, [])
    await api.list('/instruments', 'grand piano')
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/instruments?q=grand%20piano`,
      expect.anything()
    )
  })
})

describe('api.get', () => {
  it('calls endpoint/id', async () => {
    const spy = mockFetch(200, { id: '42' })
    await api.get('/instruments', '42')
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/instruments/42`,
      expect.anything()
    )
  })
})

describe('api.create', () => {
  it('calls POST with JSON body', async () => {
    const spy = mockFetch(201, { id: '1' })
    await api.create('/instruments', { name: 'Piano' })
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/instruments`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Piano' }),
      })
    )
  })
})

describe('api.update', () => {
  it('calls PATCH with JSON body', async () => {
    const spy = mockFetch(200, { id: '1', name: 'Grand Piano' })
    await api.update('/instruments', '1', { name: 'Grand Piano' })
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/instruments/1`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Grand Piano' }),
      })
    )
  })
})

describe('api.delete', () => {
  it('calls DELETE on endpoint/id', async () => {
    const spy = mockFetch(204)
    await api.delete('/instruments', '1')
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/instruments/1`,
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})

describe('error handling', () => {
  it('throws on non-ok response with detail message', async () => {
    mockFetch(404, { detail: 'Not found' })
    await expect(api.get('/instruments', '999')).rejects.toThrow('Not found')
  })
})

describe('204 No Content', () => {
  it('returns undefined for 204 response', async () => {
    mockFetch(204)
    const result = await api.delete('/instruments', '1')
    expect(result).toBeUndefined()
  })
})

describe('api.uploadPhoto', () => {
  it('calls POST on endpoint/id/photo with file as body', async () => {
    const spy = mockFetch(200, { photo_key: 'uploads/img.jpg' })
    const file = new File(['data'], 'img.jpg', { type: 'image/jpeg' })
    await api.uploadPhoto('/gearlist/gear', 'gear-1', file)
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/gearlist/gear/gear-1/photo`,
      expect.objectContaining({ method: 'POST', body: file })
    )
  })
})

describe('api.searchEntities', () => {
  it('calls /search/entities with q param', async () => {
    const spy = mockFetch(200, { results: [] })
    await api.searchEntities('fender')
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('/search/entities')
    expect(url).toContain('q=fender')
  })

  it('includes exclude_table and exclude_id when provided', async () => {
    const spy = mockFetch(200, { results: [] })
    await api.searchEntities('ssl', 'brands', 'uuid-1')
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('exclude_table=brands')
    expect(url).toContain('exclude_id=uuid-1')
  })

  it('omits exclude params when not provided', async () => {
    const spy = mockFetch(200, { results: [] })
    await api.searchEntities('waves')
    const url = spy.mock.calls[0][0] as string
    expect(url).not.toContain('exclude_table')
    expect(url).not.toContain('exclude_id')
  })
})

describe('api.scanner', () => {
  it('runs: calls GET /scanner/scans', async () => {
    const spy = mockFetch(200, [])
    await api.scanner.runs()
    expect(spy).toHaveBeenCalledWith(`${BASE}/scanner/scans`, expect.anything())
  })

  it('report: calls /scanner/report without scanId', async () => {
    const spy = mockFetch(200, {})
    await api.scanner.report()
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('/scanner/report')
    expect(url).not.toContain('scan_id')
  })

  it('report: appends scan_id when provided', async () => {
    const spy = mockFetch(200, {})
    await api.scanner.report('scan-abc')
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('scan_id=scan-abc')
  })

  it('confirm: POSTs decisions to /scanner/confirm', async () => {
    const spy = mockFetch(200, { applied: 1, errors: [] })
    const decisions = [{ result_id: 'r1', action: 'acknowledge' as const }]
    await api.scanner.confirm(decisions)
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/confirm`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ confirmations: decisions }) })
    )
  })

  it('acknowledge: POSTs acknowledge action for a single resultId', async () => {
    const spy = mockFetch(200, { applied: 1, errors: [] })
    await api.scanner.acknowledge('r1')
    const init = spy.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.confirmations[0]).toMatchObject({ result_id: 'r1', action: 'acknowledge' })
  })

  it('force: POSTs force action with target fields', async () => {
    const spy = mockFetch(200, { applied: 1, errors: [] })
    await api.scanner.force({ resultId: 'r1', targetId: 't1', targetTable: 'effects' })
    const init = spy.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.confirmations[0]).toMatchObject({ result_id: 'r1', action: 'force', target_id: 't1', target_table: 'effects' })
  })

  it('catalogSearch: calls /scanner/catalog/search with q', async () => {
    const spy = mockFetch(200, [])
    await api.scanner.catalogSearch({ q: 'reverb' })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('/scanner/catalog/search')
    expect(url).toContain('q=reverb')
  })

  it('catalogSearch: appends table param when provided', async () => {
    const spy = mockFetch(200, [])
    await api.scanner.catalogSearch({ q: 'ssl', table: 'effects' })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('table=effects')
  })

  it('dismiss: PATCHes /scanner/results/:id/dismiss', async () => {
    const spy = mockFetch(204)
    await api.scanner.dismiss('r1')
    expect(spy).toHaveBeenCalledWith(`${BASE}/scanner/results/r1/dismiss`, expect.objectContaining({ method: 'PATCH' }))
  })

  it('keep: PATCHes /scanner/results/:id/keep', async () => {
    const spy = mockFetch(204)
    await api.scanner.keep('r1')
    expect(spy).toHaveBeenCalledWith(`${BASE}/scanner/results/r1/keep`, expect.objectContaining({ method: 'PATCH' }))
  })

  it('exclusions: calls GET /scanner/exclusions', async () => {
    const spy = mockFetch(200, [])
    await api.scanner.exclusions()
    expect(spy).toHaveBeenCalledWith(`${BASE}/scanner/exclusions`, expect.anything())
  })

  it('removeExclusion: DELETEs /scanner/exclude/:id', async () => {
    const spy = mockFetch(204)
    await api.scanner.removeExclusion('ex-1')
    expect(spy).toHaveBeenCalledWith(`${BASE}/scanner/exclude/ex-1`, expect.objectContaining({ method: 'DELETE' }))
  })

  it('listKeys: calls GET /scanner/keys', async () => {
    const spy = mockFetch(200, [])
    await api.scanner.listKeys()
    expect(spy).toHaveBeenCalledWith(`${BASE}/scanner/keys`, expect.anything())
  })

  it('createKey: POSTs label to /scanner/keys', async () => {
    const spy = mockFetch(201, { key_id: 'k1', key: 'psc_abc', label: 'ci', key_hint: 'abc', created_at: '', revoked_at: null })
    await api.scanner.createKey('ci')
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/keys`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ label: 'ci' }) })
    )
  })

  it('revokeKey: DELETEs /scanner/keys/:id', async () => {
    const spy = mockFetch(204)
    await api.scanner.revokeKey('k1')
    expect(spy).toHaveBeenCalledWith(`${BASE}/scanner/keys/k1`, expect.objectContaining({ method: 'DELETE' }))
  })

  it('purge: DELETEs /scanner/scans with older_than_days param', async () => {
    const spy = mockFetch(200, { deleted_count: 3 })
    await api.scanner.purge(30)
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('/scanner/scans')
    expect(url).toContain('older_than_days=30')
  })

  it('purge: DELETEs /scanner/scans without param when all', async () => {
    const spy = mockFetch(200, { deleted_count: 10 })
    await api.scanner.purge('all')
    const url = spy.mock.calls[0][0] as string
    expect(url).toMatch(/\/scanner\/scans$/)
  })
})

describe('api.listPaged', () => {
  it('serializes single sort_by as a repeated param', async () => {
    const spy = mockFetch(200, { items: [], total: 0 })
    await api.listPaged('/brands', { sort_by: ['brand_name'], sort_dir: ['asc'] })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('sort_by=brand_name')
    expect(url).toContain('sort_dir=asc')
  })

  it('serializes multiple sort_by as repeated params', async () => {
    const spy = mockFetch(200, { items: [], total: 0 })
    await api.listPaged('/brands', {
      sort_by: ['brand_name', 'created_at'],
      sort_dir: ['asc', 'desc'],
    })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('sort_by=brand_name')
    expect(url).toContain('sort_by=created_at')
    expect(url).toContain('sort_dir=asc')
    expect(url).toContain('sort_dir=desc')
  })

  it('serializes contains filter as filter_<key>=value', async () => {
    const spy = mockFetch(200, { items: [], total: 0 })
    const filters: FilterState = { name: { value: 'ssl', operator: 'contains' } }
    await api.listPaged('/brands', { filters })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('filter_name=ssl')
    expect(url).not.toContain('filter_name_op')
  })

  it('serializes equals filter with _op param', async () => {
    const spy = mockFetch(200, { items: [], total: 0 })
    const filters: FilterState = { name: { value: 'Ableton', operator: 'equals' } }
    await api.listPaged('/brands', { filters })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('filter_name=Ableton')
    expect(url).toContain('filter_name_op=equals')
  })

  it('serializes fuzzy filter with _op param', async () => {
    const spy = mockFetch(200, { items: [], total: 0 })
    const filters: FilterState = { name: { value: 'abelton', operator: 'fuzzy' } }
    await api.listPaged('/brands', { filters })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('filter_name=abelton')
    expect(url).toContain('filter_name_op=fuzzy')
  })

  it('serializes is_empty with only _op param (no value)', async () => {
    const spy = mockFetch(200, { items: [], total: 0 })
    const filters: FilterState = { version: { value: '', operator: 'is_empty' } }
    await api.listPaged('/effects', { filters })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('filter_version_op=is_empty')
    expect(url).not.toContain('filter_version=')
  })

  it('serializes is_not_empty with only _op param', async () => {
    const spy = mockFetch(200, { items: [], total: 0 })
    const filters: FilterState = { version: { value: '', operator: 'is_not_empty' } }
    await api.listPaged('/effects', { filters })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('filter_version_op=is_not_empty')
    expect(url).not.toContain('filter_version=')
  })
})
