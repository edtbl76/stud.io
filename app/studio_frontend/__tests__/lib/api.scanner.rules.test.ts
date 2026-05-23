import { api } from '../../lib/api'

function mockFetch(body?: unknown) {
  const mock = jest.fn().mockResolvedValue({
    ok: true, status: 200, statusText: 'OK',
    json: async () => body ?? {},
  } as Response)
  global.fetch = mock
  return mock
}

afterEach(() => jest.restoreAllMocks())

const BASE = '/api'

// Step 1
describe('api.scanner.rules', () => {
  it('calls GET /scanner/rules', async () => {
    const spy = mockFetch({ vendor: [], name: [], pattern: [] })
    await api.scanner.rules()
    expect(spy).toHaveBeenCalledWith(`${BASE}/scanner/rules`, expect.anything())
  })
})

// Step 2
describe('api.scanner.createVendorRule', () => {
  it('calls POST /scanner/rules/vendor with input as body', async () => {
    const spy = mockFetch({})
    const input = { disk_vendor: 'ikmultimedia', catalog_vendor: 'IK Multimedia' }
    await api.scanner.createVendorRule(input)
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/rules/vendor`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) })
    )
  })
})

// Step 3
describe('api.scanner.createNameRule', () => {
  it('calls POST /scanner/rules/name with input as body', async () => {
    const spy = mockFetch({})
    const input = { disk_name: 'reverb pro', catalog_name: 'Reverb Pro' }
    await api.scanner.createNameRule(input)
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/rules/name`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) })
    )
  })
})

// Step 4
describe('api.scanner.createPatternRule', () => {
  it('calls POST /scanner/rules/pattern with input as body', async () => {
    const spy = mockFetch({})
    const input = { label: 'Mono variant', pattern: '{name}(m)', match_fields: ['vendor'], action: 'alias_to_match', enabled: false }
    await api.scanner.createPatternRule(input)
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/rules/pattern`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) })
    )
  })
})

// Step 5
describe('api.scanner.updateRule', () => {
  it('calls PATCH /scanner/rules/{type}/{id} with catalog value as body', async () => {
    const spy = mockFetch({})
    await api.scanner.updateRule('abc', 'vendor', 'IK Multimedia')
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/rules/vendor/abc`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ catalog_vendor: 'IK Multimedia' }) })
    )
  })

  it('uses catalog_name key for name rules', async () => {
    const spy = mockFetch({})
    await api.scanner.updateRule('xyz', 'name', 'Reverb Pro')
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/rules/name/xyz`,
      expect.objectContaining({ body: JSON.stringify({ catalog_name: 'Reverb Pro' }) })
    )
  })
})

// Step 6
describe('api.scanner.deleteRule', () => {
  it('calls DELETE /scanner/rules/{type}/{id}', async () => {
    const spy = mockFetch()
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204, json: async () => undefined } as unknown as Response)
    await api.scanner.deleteRule('abc', 'vendor')
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/scanner/rules/vendor/abc`,
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})

// Step 7
describe('api.scanner.toggleRule', () => {
  it('calls PATCH /scanner/rules/{type}/{id}/toggle with enabled in body', async () => {
    const spy = mockFetch({})
    await api.scanner.toggleRule('abc', 'name', false)
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/rules/name/abc/toggle`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ enabled: false }) })
    )
  })
})

// Step 8
describe('api.scanner.acknowledgeClean', () => {
  it('calls POST /scanner/rules/{type}/{id}/acknowledge-clean', async () => {
    const spy = mockFetch({ acknowledged: 5 })
    await api.scanner.acknowledgeClean('abc', 'vendor')
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/scanner/rules/vendor/abc/acknowledge-clean`,
      expect.objectContaining({ method: 'POST' })
    )
  })
})
