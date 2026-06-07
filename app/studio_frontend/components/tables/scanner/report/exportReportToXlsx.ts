export function exportReportToXlsx(scanId: string): void {
  window.open(`/api/scanner/scans/${encodeURIComponent(scanId)}/export`, '_blank', 'noopener,noreferrer')
}
