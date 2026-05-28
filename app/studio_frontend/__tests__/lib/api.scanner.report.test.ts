import type { ScanListItem, RawScanResult, RawScanReport } from '@/lib/types'
import { api } from '@/lib/api'

const BASE = '/api'

function mockFetch(status: number, body: unknown) {
  const mock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
  } as Response)
  global.fetch = mock
  return mock
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('api.scanner.recentScans', () => {
  it('calls GET /scanner/scans/recent', async () => {
    const spy = mockFetch(200, [])
    await api.scanner.recentScans()
    expect(spy).toHaveBeenCalledWith(`${BASE}/scanner/scans/recent`, expect.anything())
  })
})

describe('api.scanner.rawReport', () => {
  it('calls GET /scanner/scans/{id}/report', async () => {
    const spy = mockFetch(200, {})
    await api.scanner.rawReport('scan-abc')
    expect(spy).toHaveBeenCalledWith(`${BASE}/scanner/scans/scan-abc/report`, expect.anything())
  })
})

describe('ScanListItem', () => {
  const item: ScanListItem = {
    scan_id: 'scan-1',
    scanned_at: '2026-05-25T14:32:00Z',
    source_machine: "Edward's Mac Studio",
    total_count: 847,
  }

  it('scanned_at is a valid ISO date', () => {
    expect(isNaN(new Date(item.scanned_at).getTime())).toBe(false)
  })

  it('JSON round-trip preserves all fields', () => {
    const roundTripped: ScanListItem = JSON.parse(JSON.stringify(item))
    expect(roundTripped).toEqual(item)
  })

  it('scanned_at "not-a-date" produces an invalid Date', () => {
    const invalid = { ...item, scanned_at: 'not-a-date' }
    expect(isNaN(new Date(invalid.scanned_at).getTime())).toBe(true)
  })

  it('missing scan_id is undefined after JSON.parse', () => {
    const invalid = JSON.parse(
      JSON.stringify({ scanned_at: item.scanned_at, source_machine: item.source_machine, total_count: item.total_count })
    ) as ScanListItem
    expect(invalid.scan_id).toBeUndefined()
  })
})

describe('RawScanResult', () => {
  const result: RawScanResult = {
    result_id: 'r-1',
    name: 'Surge XT',
    vendor: 'Surge Synth Team',
    version: '3.3.4',
    format: 'VST3',
    path: '/Library/Audio/Plug-Ins/VST3/Surge XT.vst3',
    status: 'matched',
    confidence: 'exact',
  }

  it('JSON round-trip preserves all fields', () => {
    const roundTripped: RawScanResult = JSON.parse(JSON.stringify(result))
    expect(roundTripped).toEqual(result)
  })

  it('null result_id is detectable at runtime', () => {
    const invalid = JSON.parse(
      JSON.stringify({ ...result, result_id: null })
    ) as RawScanResult
    expect(invalid.result_id).toBeNull()
  })
})

describe('RawScanReport', () => {
  const report: RawScanReport = {
    scan_id: 'scan-1',
    scanned_at: '2026-05-25T14:32:00Z',
    results_by_status: {
      matched: [],
      known: [],
    },
  }

  it('scanned_at is a valid ISO date', () => {
    expect(isNaN(new Date(report.scanned_at).getTime())).toBe(false)
  })

  it('results_by_status values are all arrays', () => {
    expect(Object.values(report.results_by_status).every(Array.isArray)).toBe(true)
  })

  it('JSON round-trip preserves results_by_status structure', () => {
    const roundTripped: RawScanReport = JSON.parse(JSON.stringify(report))
    expect(roundTripped.results_by_status).toEqual({ matched: [], known: [] })
  })

  it('results_by_status with a null value fails the array check', () => {
    const invalid = { ...report, results_by_status: { matched: null } } as unknown as RawScanReport
    expect(Object.values(invalid.results_by_status).every(Array.isArray)).toBe(false)
  })
})
