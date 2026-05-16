import type { ScanResult } from '@/lib/types'

interface MatchedRowProps {
  result: ScanResult
  onViewRecord: (result: ScanResult) => void
  onAcknowledge: (resultId: string) => void
}

export function MatchedRow({ result, onViewRecord, onAcknowledge }: Readonly<MatchedRowProps>) {
  return (
    <div className="relative flex items-center gap-4 px-4 py-3 border-b border-border/50 text-sm hover:bg-muted/30">
      <button
        className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
        onClick={() => onViewRecord(result)}
        aria-label={`View record for ${result.name}`}
        data-testid={`matched-row-${result.result_id}`}
      />
      <div className="relative z-10 flex-1 min-w-0 pointer-events-none">
        <p className="font-medium text-foreground truncate">{result.name}</p>
        <p className="text-xs text-muted-foreground truncate">{result.vendor} · {result.format} · {result.path}</p>
      </div>
      {result.match?.record_name && (
        <div className="relative z-10 text-xs text-muted-foreground text-right shrink-0 pointer-events-none">
          <p className="text-foreground">{result.match.record_name}</p>
          <p>{result.match.record_table}</p>
        </div>
      )}
      <div className="relative z-10 shrink-0">
        {result.confirmed_at ? (
          <span
            className="text-xs text-green-600 font-medium"
            data-testid={`confirmed-indicator-${result.result_id}`}
          >
            Confirmed
          </span>
        ) : (
          <button
            onClick={() => onAcknowledge(result.result_id)}
            className="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted text-muted-foreground"
            aria-label={`Acknowledge ${result.name}`}
            data-testid={`acknowledge-button-${result.result_id}`}
          >
            Acknowledge
          </button>
        )}
      </div>
    </div>
  )
}
