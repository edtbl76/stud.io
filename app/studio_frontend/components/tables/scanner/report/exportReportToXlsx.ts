import ExcelJS from 'exceljs'
import { sortedStatusKeys, formatStatusLabel } from './reportUtils'
import type { RawScanReport } from '@/lib/types'

const MAX_SHEET_NAME_LENGTH = 31

function uniqueSheetName(wb: ExcelJS.Workbook, label: string): string {
  const base = label.slice(0, MAX_SHEET_NAME_LENGTH)
  if (!wb.worksheets.some((ws) => ws.name === base)) return base
  const truncated = label.slice(0, MAX_SHEET_NAME_LENGTH - 2)
  let n = 2
  while (wb.worksheets.some((ws) => ws.name === `${truncated}_${n}`)) n++
  return `${truncated}_${n}`
}

const COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: 'Name',       key: 'name',       width: 30 },
  { header: 'Vendor',     key: 'vendor',      width: 24 },
  { header: 'Version',    key: 'version',     width: 12 },
  { header: 'Format',     key: 'format',      width: 10 },
  { header: 'Path',       key: 'path',        width: 60 },
  { header: 'Confidence', key: 'confidence',  width: 14 },
]

export async function buildReportWorkbook(report: RawScanReport): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  const orderedKeys = sortedStatusKeys(Object.keys(report.results_by_status))

  for (const status of orderedKeys) {
    const rows = report.results_by_status[status]
    if (!rows?.length) continue

    const sheetName = uniqueSheetName(wb, formatStatusLabel(status))
    const ws = wb.addWorksheet(sheetName)
    ws.columns = COLUMNS

    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true }
    headerRow.commit()

    for (const r of rows) {
      ws.addRow({
        name: r.name,
        vendor: r.vendor,
        version: r.version,
        format: r.format,
        path: r.path,
        confidence: r.confidence ?? '',
      })
    }
  }

  return wb
}

export async function exportReportToXlsx(report: RawScanReport, filename: string): Promise<void> {
  const wb = await buildReportWorkbook(report)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
