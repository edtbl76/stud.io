import type { ScanResult } from '@/lib/types'

const CONFIDENCE_STYLES: Record<string, string> = {
  exact:  'bg-green-500/15 text-green-600 dark:text-green-400',
  high:   'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  medium: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  low:    'bg-red-500/15 text-red-600 dark:text-red-400',
}

interface UnconfirmedRowProps {
  result: ScanResult
  onConfirm: (resultId: string) => void
  onReject: (resultId: string) => void
  onIgnore: (resultId: string) => void
}

export function UnconfirmedRow({ result, onConfirm, onReject, onIgnore }: Readonly<UnconfirmedRowProps>) {
  const confidenceStyle = result.confidence ? (CONFIDENCE_STYLES[result.confidence] ?? '') : ''

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 border-b border-border/50 text-sm"
      data-testid={`unconfirmed-row-${result.result_id}`}
    >
      {result.confidence && (
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${confidenceStyle}`}
          aria-label={`Confidence: ${result.confidence}`}
          data-testid="confidence-badge"
        >
          {result.confidence}
        </span>
      )}

      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{result.name}</p>
        <p className="text-xs text-muted-foreground truncate">{result.vendor} · {result.version} · {result.format}</p>
      </div>

      {result.matched_record && (
        <div className="text-xs text-muted-foreground text-right shrink-0 hidden md:block">
          <p className="text-foreground">{result.matched_record.name}</p>
          <p>{result.matched_record.record_table}</p>
        </div>
      )}

      <div className="flex gap-1.5 shrink-0">
        <button
          onClick={() => onConfirm(result.result_id)}
          className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          aria-label={`Confirm match for ${result.name}`}
          data-testid={`confirm-button-${result.result_id}`}
        >
          Confirm
        </button>
        <button
          onClick={() => onReject(result.result_id)}
          className="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted"
          aria-label={`Reject match for ${result.name}`}
          data-testid={`reject-button-${result.result_id}`}
        >
          Reject
        </button>
        <button
          onClick={() => onIgnore(result.result_id)}
          className="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted text-muted-foreground"
          aria-label={`Ignore ${result.name}`}
          data-testid={`ignore-button-${result.result_id}`}
        >
          Ignore
        </button>
      </div>
    </div>
  )
}
