interface ScanInProgressBannerProps {
  scannedAt: string
}

export function ScanInProgressBanner({ scannedAt }: Readonly<ScanInProgressBannerProps>) {
  return (
    <output
      className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-600 dark:text-yellow-400"
      data-testid="scan-in-progress-banner"
    >
      <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 animate-pulse" aria-hidden="true" />
      Scan in progress since {new Date(scannedAt).toLocaleTimeString()}. Refreshing automatically...
    </output>
  )
}
