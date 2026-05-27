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

describe('scan report types', () => {
  it('ScanListItem is assignable', () => {
    const item: ScanListItem = {
      scan_id: 'scan-1',
      scanned_at: '2026-05-25T14:32:00Z',
      source_machine: "Edward's Mac Studio",
      total_count: 847,
    }
    expect(item.scan_id).toBe('scan-1')
  })

  it('RawScanResult is assignable', () => {
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
    expect(result.result_id).toBe('r-1')
  })

  it('RawScanReport is assignable', () => {
    const report: RawScanReport = {
      scan_id: 'scan-1',
      scanned_at: '2026-05-25T14:32:00Z',
      results_by_status: {
        matched: [],
        known: [],
      },
    }
    expect(report.scan_id).toBe('scan-1')
  })
})
