interface BulkActionBarProps {
  highConfidenceCount: number
  onConfirmAll: () => void
}

export function BulkActionBar({ highConfidenceCount, onConfirmAll }: Readonly<BulkActionBarProps>) {
  const disabled = highConfidenceCount === 0

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30">
      <button
        onClick={onConfirmAll}
        disabled={disabled}
        className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
        aria-label={`Confirm all ${highConfidenceCount} high-confidence matches`}
        data-testid="confirm-all-high-confidence-button"
      >
        Confirm All (High Confidence)
      </button>
      {!disabled && (
        <span className="text-xs text-muted-foreground" data-testid="high-confidence-count">
          {highConfidenceCount} {highConfidenceCount === 1 ? 'match' : 'matches'}
        </span>
      )}
    </div>
  )
}
