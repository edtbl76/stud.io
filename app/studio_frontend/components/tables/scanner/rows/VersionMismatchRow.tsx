import type { ScanResult } from '@/lib/types'

interface VersionMismatchRowProps { result: ScanResult }

export function VersionMismatchRow({ result }: Readonly<VersionMismatchRowProps>) {
  const catalogVersion = result.matched_record?.version ?? '—'

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 border-b border-border/50 text-sm"
      data-testid={`version-mismatch-row-${result.result_id}`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{result.name}</p>
        <p className="text-xs text-muted-foreground truncate">{result.vendor} · {result.format} · {result.path}</p>
      </div>
      <div className="text-xs text-right shrink-0 space-y-0.5">
        <p className="text-muted-foreground">
          Disk: <span className="text-foreground font-mono">{result.version}</span>
        </p>
        <p className="text-muted-foreground">
          Catalog: <span className="text-amber-500 font-mono">{catalogVersion}</span>
        </p>
      </div>
    </div>
  )
}
