'use client'

import { NativeSelect } from '@/components/ui/NativeSelect'
import { Skeleton } from '@/components/ui/skeleton'
import { ReportRow } from './ReportRow'
import { useReportPage } from './useReportPage'
import { formatPickerLabel, formatStatusLabel, sortedStatusKeys } from './reportUtils'
import type { RawScanReport, RawScanResult } from '@/lib/types'

interface StatusSectionProps {
  readonly status: string
  readonly rows: RawScanResult[]
  readonly isOpen: boolean
  readonly onToggle: () => void
}

function StatusSection({ status, rows, isOpen, onToggle }: StatusSectionProps) {
  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-left hover:bg-muted/50"
        onClick={onToggle}
      >
        <span>{formatStatusLabel(status)} ({rows.length})</span>
        <span className="text-muted-foreground">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="border-t">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Vendor</th>
                <th className="px-3 py-2 text-left font-medium">Version</th>
                <th className="px-3 py-2 text-left font-medium">Format</th>
                <th className="px-3 py-2 text-left font-medium">Path</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => <ReportRow key={row.result_id} row={row} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

interface ReportBodyProps {
  readonly report: RawScanReport | null
  readonly loadingReport: boolean
  readonly error: string | null
  readonly openSections: Set<string>
  readonly onToggleSection: (status: string) => void
}

function ReportBody({ report, loadingReport, error, openSections, onToggleSection }: ReportBodyProps) {
  const orderedKeys = report ? sortedStatusKeys(Object.keys(report.results_by_status)) : []
  return (
    <>
      {loadingReport && <Skeleton data-testid="report-loading" className="h-48 w-full" />}
      {error && (
        <div data-testid="report-error" role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {report && !loadingReport && (
        <div className="space-y-1">
          {orderedKeys.map(status => (
            <StatusSection
              key={status}
              status={status}
              rows={report.results_by_status[status]}
              isOpen={openSections.has(status)}
              onToggle={() => onToggleSection(status)}
            />
          ))}
        </div>
      )}
    </>
  )
}

const ERROR_CLASS = 'rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive'

export function ScanReportPage() {
  const { scans, selectedScanId, setSelectedScanId, report, loadingScans, loadingReport, error, openSections, handleToggleSection } = useReportPage()

  if (loadingScans) return <Skeleton className="h-10 w-full" />

  if (error && scans.length === 0) {
    return <div data-testid="report-error" role="alert" className={ERROR_CLASS}>{error}</div>
  }

  if (scans.length === 0) {
    return (
      <div data-testid="report-empty-state" className="p-6 text-sm text-muted-foreground">
        No scans found. Run the plugin scanner to generate a report.
      </div>
    )
  }

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <label htmlFor="scan-picker" className="text-sm font-medium whitespace-nowrap">Scan run</label>
        <NativeSelect
          id="scan-picker"
          value={selectedScanId ?? ''}
          onChange={e => setSelectedScanId(e.target.value)}
          disabled={loadingReport}
        >
          {scans.map(s => (
            <option key={s.scan_id} value={s.scan_id}>{formatPickerLabel(s)}</option>
          ))}
        </NativeSelect>
      </div>
      <ReportBody
        report={report}
        loadingReport={loadingReport}
        error={error}
        openSections={openSections}
        onToggleSection={handleToggleSection}
      />
    </div>
  )
}
