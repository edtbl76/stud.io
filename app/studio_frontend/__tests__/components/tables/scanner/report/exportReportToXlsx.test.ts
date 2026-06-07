import { buildReportWorkbook } from '@/app/api/scanner/scans/[scanId]/export/_workbookUtils'
import type { RawScanReport } from '@/lib/types'

function makeResult(name: string, format = 'vst3') {
  return { result_id: `r-${name}`, name, vendor: 'Vendor', version: '1.0', format, path: `/p/${name}`, status: 'known', confidence: 'exact' }
}

const REPORT: RawScanReport = {
  scan_id: 'scan-1',
  scanned_at: '2026-05-25T14:00:00Z',
  results_by_status: {
    known: [makeResult('Surge XT'), makeResult('Pigments')],
    unlinked: [makeResult('Unknown Plugin')],
  },
}

describe('buildReportWorkbook', () => {
  it('creates one worksheet per non-empty status group', async () => {
    const wb = await buildReportWorkbook(REPORT)
    const names = wb.worksheets.map(ws => ws.name)
    expect(names).toContain('Known')
    expect(names).toContain('Unlinked')
  })

  it('skips status groups with no rows', async () => {
    const report: RawScanReport = {
      ...REPORT,
      results_by_status: { known: [makeResult('A')], unlinked: [] },
    }
    const wb = await buildReportWorkbook(report)
    expect(wb.worksheets.map(ws => ws.name)).not.toContain('Unlinked')
  })

  it('worksheet contains the correct number of data rows (excluding header)', async () => {
    const wb = await buildReportWorkbook(REPORT)
    const knownSheet = wb.worksheets.find(ws => ws.name === 'Known')!
    expect(knownSheet.rowCount).toBe(REPORT.results_by_status.known.length + 1)
  })

  it('header row has Name, Vendor, Version, Format, Path, Confidence columns', async () => {
    const wb = await buildReportWorkbook(REPORT)
    const ws = wb.worksheets[0]
    const headers = ws.getRow(1).values as string[]
    expect(headers).toEqual(expect.arrayContaining(['Name', 'Vendor', 'Version', 'Format', 'Path', 'Confidence']))
  })

  it('data rows contain the correct name values', async () => {
    const wb = await buildReportWorkbook(REPORT)
    const ws = wb.worksheets.find(ws => ws.name === 'Known')!
    const rowNames = [ws.getRow(2).getCell('name').value, ws.getRow(3).getCell('name').value]
    expect(rowNames).toEqual(['Surge XT', 'Pigments'])
  })

  it('orders worksheets by canonical status order (known before unlinked)', async () => {
    const wb = await buildReportWorkbook(REPORT)
    const names = wb.worksheets.map(ws => ws.name)
    expect(names.indexOf('Known')).toBeLessThan(names.indexOf('Unlinked'))
  })

  it('produces unique sheet names when labels collide after 31-char truncation', async () => {
    const long = 'a'.repeat(32)
    const report: RawScanReport = {
      scan_id: 'scan-1',
      scanned_at: '2026-05-25T14:00:00Z',
      results_by_status: {
        [long]: [makeResult('X')],
        [`${long}z`]: [makeResult('Y')],
      },
    }
    const wb = await buildReportWorkbook(report)
    const names = wb.worksheets.map(ws => ws.name)
    expect(new Set(names).size).toBe(2)
    expect(names.every(n => n.length <= 31)).toBe(true)
  })
})
