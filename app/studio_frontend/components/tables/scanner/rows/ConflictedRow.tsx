import type { ScanResult } from '@/lib/types'

interface ConflictedRowProps {
  result: ScanResult
  selected: boolean
  onSelect: (resultId: string) => void
  onViewRecord: (result: ScanResult) => void
}

export function ConflictedRow({ result, selected, onSelect, onViewRecord }: Readonly<ConflictedRowProps>) {
  const catalogVersion = result.match?.record_version ?? '—'

  return (
    <div className="relative flex items-center gap-4 px-4 py-3 border-b border-border/50 text-sm hover:bg-muted/30">
      <button
        className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
        onClick={() => onViewRecord(result)}
        aria-label={`View record for ${result.name}`}
        data-testid={`conflicted-row-${result.result_id}`}
      />
      <div className="relative z-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(result.result_id)}
          data-testid={`conflicted-checkbox-${result.result_id}`}
          aria-label={`Select ${result.name}`}
          className="rounded border-border"
        />
      </div>
      <div className="relative z-10 flex-1 min-w-0 pointer-events-none">
        <p className="font-medium text-foreground truncate">{result.name}</p>
        <p className="text-xs text-muted-foreground truncate">{result.vendor} · {result.format} · {result.path}</p>
      </div>
      <div className="relative z-10 text-xs text-right shrink-0 space-y-0.5 pointer-events-none">
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
