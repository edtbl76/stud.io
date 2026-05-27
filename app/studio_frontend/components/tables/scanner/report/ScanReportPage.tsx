'use client'

import { useEffect, useState } from 'react'
import { NativeSelect } from '@/components/ui/NativeSelect'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { ReportRow } from './ReportRow'
import type { RawScanReport, RawScanResult, ScanListItem } from '@/lib/types'

const CANONICAL_STATUS_ORDER = [
  'known',
  'unlinked',
  'matched',
  'needs_review',
  'unconfirmed',
  'conflicted',
  'orphaned',
  'untracked',
  'excluded',
  'ignored',
]

function formatPickerLabel(scan: ScanListItem): string {
  const d = new Date(scan.scanned_at)
  const date = d.toLocaleDateString('en-CA')
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time} · ${scan.source_machine} (${scan.total_count} results)`
}

function formatStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ')
}

function sortedStatusKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ai = CANONICAL_STATUS_ORDER.indexOf(a)
    const bi = CANONICAL_STATUS_ORDER.indexOf(b)
    const aOrder = ai === -1 ? Infinity : ai
    const bOrder = bi === -1 ? Infinity : bi
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.localeCompare(b)
  })
}

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

export function ScanReportPage() {
  const [scans, setScans] = useState<ScanListItem[]>([])
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null)
  const [report, setReport] = useState<RawScanReport | null>(null)
  const [loadingScans, setLoadingScans] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.scanner.recentScans()
      .then(data => {
        setScans(data)
        if (data.length > 0) setSelectedScanId(data[0].scan_id)
      })
      .catch(() => setError('Failed to load scan list'))
      .finally(() => setLoadingScans(false))
  }, [])

  useEffect(() => {
    if (!selectedScanId) return
    setLoadingReport(true)
    setReport(null)
    setError(null)
    setOpenSections(new Set())
    api.scanner.rawReport(selectedScanId)
      .then(data => setReport(data))
      .catch(() => setError('Failed to load scan report'))
      .finally(() => setLoadingReport(false))
  }, [selectedScanId])

  function handleToggleSection(status: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  if (loadingScans) return <Skeleton className="h-10 w-full" />

  if (scans.length === 0) {
    return (
      <div data-testid="report-empty-state" className="p-6 text-sm text-muted-foreground">
        No scans found. Run the plugin scanner to generate a report.
      </div>
    )
  }

  const orderedKeys = report ? sortedStatusKeys(Object.keys(report.results_by_status)) : []

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
              onToggle={() => handleToggleSection(status)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
