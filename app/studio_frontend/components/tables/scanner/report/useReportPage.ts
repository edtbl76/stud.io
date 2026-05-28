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

export function useReportPage(): ReportState {
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
    let stale = false
    setLoadingReport(true)
    setReport(null)
    setError(null)
    setOpenSections(new Set())
    api.scanner.rawReport(selectedScanId)
      .then(data => { if (!stale) setReport(data) })
      .catch(() => { if (!stale) setError('Failed to load scan report') })
      .finally(() => { if (!stale) setLoadingReport(false) })
    return () => { stale = true }
  }, [selectedScanId])

  function handleToggleSection(status: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  return { scans, selectedScanId, setSelectedScanId, report, loadingScans, loadingReport, error, openSections, handleToggleSection }
}
