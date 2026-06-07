import ExcelJS from 'exceljs'
import { sortedStatusKeys, formatStatusLabel } from '@/components/tables/scanner/report/reportUtils'
import type { RawScanReport, RawScanResult } from '@/lib/types'

export const MAX_SHEET_NAME_LENGTH = 31

export const XLSX_COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: 'Name',       key: 'name',       width: 30 },
  { header: 'Vendor',     key: 'vendor',      width: 24 },
  { header: 'Version',    key: 'version',     width: 12 },
  { header: 'Format',     key: 'format',      width: 10 },
  { header: 'Path',       key: 'path',        width: 60 },
  { header: 'Confidence', key: 'confidence',  width: 14 },
]

export function uniqueSheetName(wb: ExcelJS.Workbook, label: string): string {
  const base = label.slice(0, MAX_SHEET_NAME_LENGTH)
  if (!wb.worksheets.some((ws) => ws.name === base)) return base
  const truncated = label.slice(0, MAX_SHEET_NAME_LENGTH - 2)
  let n = 2
  while (wb.worksheets.some((ws) => ws.name === `${truncated}_${n}`)) n++
  return `${truncated}_${n}`
}

function addRow(ws: ExcelJS.Worksheet, r: RawScanResult): void {
  ws.addRow({
    name: r.name,
    vendor: r.vendor,
    version: r.version,
    format: r.format,
    path: r.path,
    confidence: r.confidence ?? '',
  })
}

export async function buildReportWorkbook(report: RawScanReport): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  for (const status of sortedStatusKeys(Object.keys(report.results_by_status))) {
    const rows = report.results_by_status[status]
    if (!rows?.length) continue
    const ws = wb.addWorksheet(uniqueSheetName(wb, formatStatusLabel(status)))
    ws.columns = XLSX_COLUMNS
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true }
    headerRow.commit()
    for (const r of rows) addRow(ws, r)
  }
  return wb
}
