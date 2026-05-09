import type { ScanResult } from '@/lib/types'

interface OrphanedRowProps {
  result: ScanResult
  onDismiss: (resultId: string) => void
  onKeepPermanently: (resultId: string) => void
  onRemoveFromCatalog: (result: ScanResult) => void
  onViewRecord: (result: ScanResult) => void
}

export function OrphanedRow({
  result,
  onDismiss,
  onKeepPermanently,
  onRemoveFromCatalog,
  onViewRecord,
}: Readonly<OrphanedRowProps>) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3 border-b border-border/50 text-sm"
      data-testid={`orphaned-row-${result.result_id}`}
    >
      <div className="flex-1 min-w-0">
        {result.match?.record_name ? (
          <>
            <p className="font-medium text-foreground truncate">{result.match.record_name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {result.match.record_vendor} · {result.match.record_version} · last seen: {result.path}
            </p>
          </>
        ) : (
          <p className="font-medium text-foreground truncate">{result.name}</p>
        )}
      </div>

      <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
        <button
          onClick={() => onViewRecord(result)}
          className="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted"
          aria-label={`View catalog record for ${result.match?.record_name ?? result.name}`}
          data-testid={`view-record-button-${result.result_id}`}
        >
          View Record
        </button>
        <button
          onClick={() => onKeepPermanently(result.result_id)}
          className="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted"
          aria-label={`Keep ${result.match?.record_name ?? result.name} permanently`}
          data-testid={`keep-button-${result.result_id}`}
        >
          Keep
        </button>
        <button
          onClick={() => onDismiss(result.result_id)}
          className="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted text-muted-foreground"
          aria-label={`Dismiss ${result.match?.record_name ?? result.name} for this scan`}
          data-testid={`dismiss-button-${result.result_id}`}
        >
          Dismiss
        </button>
        <button
          onClick={() => onRemoveFromCatalog(result)}
          className="rounded border border-destructive/50 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
          aria-label={`Remove ${result.match?.record_name ?? result.name} from catalog`}
          data-testid={`remove-button-${result.result_id}`}
        >
          Remove
        </button>
      </div>
    </div>
  )
}
