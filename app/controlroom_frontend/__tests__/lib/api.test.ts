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
