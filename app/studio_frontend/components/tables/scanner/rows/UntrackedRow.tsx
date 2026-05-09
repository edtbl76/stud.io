import type { ScanResult } from '@/lib/types'

interface UntrackedRowProps {
  result: ScanResult
  onCreateRecord: (result: ScanResult) => void
  onIgnore: (resultId: string) => void
}

export function UntrackedRow({ result, onCreateRecord, onIgnore }: Readonly<UntrackedRowProps>) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3 border-b border-border/50 text-sm"
      data-testid={`untracked-row-${result.result_id}`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{result.name}</p>
        <p className="text-xs text-muted-foreground truncate">{result.vendor} · {result.version} · {result.format} · {result.path}</p>
      </div>

      <div className="flex gap-1.5 shrink-0">
        <button
          onClick={() => onCreateRecord(result)}
          className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          aria-label={`Create catalog record for ${result.name}`}
          data-testid={`create-record-button-${result.result_id}`}
        >
          Create Record
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
