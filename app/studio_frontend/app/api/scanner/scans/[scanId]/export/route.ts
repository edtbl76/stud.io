import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { buildReportWorkbook } from './_workbookUtils'
import type { RawScanReport } from '@/lib/types'

const BACKEND = process.env.BACKEND_URL ?? 'http://controlroom_backend:5150'
const DATE_SLICE_LENGTH = 10
const REPORT_TIMEOUT_MS = 15_000

function safeDate(scannedAt: string): string {
  const d = new Date(scannedAt)
  return Number.isNaN(d.getTime()) ? 'report' : d.toISOString().slice(0, DATE_SLICE_LENGTH)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
): Promise<NextResponse> {
  const { scanId } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('controlroom_token')?.value

  const authHeaders: Record<string, string> = {}
  if (token) authHeaders['authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${BACKEND}/scanner/scans/${scanId}/report`, {
      headers: authHeaders,
      cache: 'no-store',
      signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Report fetch timed out' }, { status: 504 })
    }
    throw err
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: res.status })
  }

  const report = await res.json() as RawScanReport
  const wb = await buildReportWorkbook(report)
  const buffer = await wb.xlsx.writeBuffer()
  const filename = `scan-report-${safeDate(report.scanned_at)}.xlsx`

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
      'pragma': 'no-cache',
      'expires': '0',
    },
  })
}
