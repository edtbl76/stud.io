'use client'

import type { RawScanResult } from '@/lib/types'

interface Props {
  readonly row: RawScanResult
}

export function ReportRow({ row }: Props) {
  return (
    <tr data-testid="report-row">
      <td>{row.name}</td>
      <td>{row.vendor}</td>
      <td>{row.version}</td>
      <td>{row.format}</td>
      <td className="max-w-xs truncate" title={row.path}>{row.path}</td>
    </tr>
  )
}
