export function exportReportToXlsx(scanId: string): void {
  window.open(`/api/scanner/scans/${scanId}/export`, '_blank')
}
