import type { ScanResult } from '@/lib/types'

interface MatchedRowProps { result: ScanResult }

export function MatchedRow({ result }: Readonly<MatchedRowProps>) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3 border-b border-border/50 text-sm"
      data-testid={`matched-row-${result.result_id}`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{result.name}</p>
        <p className="text-xs text-muted-foreground truncate">{result.vendor} · {result.format} · {result.path}</p>
      </div>
      {result.match?.record_name && (
        <div className="text-xs text-muted-foreground text-right shrink-0">
          <p className="text-foreground">{result.match.record_name}</p>
          <p>{result.match.record_table}</p>
        </div>
      )}
    </div>
  )
}
