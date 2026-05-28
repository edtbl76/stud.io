import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { RawScanReport, ScanListItem } from '@/lib/types'

export interface ReportState {
  scans: ScanListItem[]
  selectedScanId: string | null
  setSelectedScanId: (id: string) => void
  report: RawScanReport | null
  loadingScans: boolean
  loadingReport: boolean
  error: string | null
  openSections: Set<string>
  handleToggleSection: (status: string) => void
}

function useRecentScans() {
  const [scans, setScans] = useState<ScanListItem[]>([])
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.scanner.recentScans()
      .then(data => {
        setScans(data)
        if (data.length > 0) setSelectedScanId(data[0].scan_id)
      })
      .catch(() => setError('Failed to load scan list'))
      .finally(() => setLoading(false))
  }, [])

  return { scans, selectedScanId, setSelectedScanId, loadingScans: loading, scansError: error }
}

function useRawReport(selectedScanId: string | null) {
  const [report, setReport] = useState<RawScanReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedScanId) return
    let stale = false
    setLoading(true)
    setReport(null)
    setError(null)
    api.scanner.rawReport(selectedScanId)
      .then(data => { if (!stale) setReport(data) })
      .catch(() => { if (!stale) setError('Failed to load scan report') })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [selectedScanId])

  return { report, loadingReport: loading, reportError: error }
}

export function useReportPage(): ReportState {
  const { scans, selectedScanId, setSelectedScanId, loadingScans, scansError } = useRecentScans()
  const { report, loadingReport, reportError } = useRawReport(selectedScanId)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())

  useEffect(() => { setOpenSections(new Set()) }, [selectedScanId])

  function handleToggleSection(status: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (!next.delete(status)) next.add(status)
      return next
    })
  }

  return {
    scans,
    selectedScanId,
    setSelectedScanId,
    report,
    loadingScans,
    loadingReport,
    error: scansError ?? reportError,
    openSections,
    handleToggleSection,
  }
}
