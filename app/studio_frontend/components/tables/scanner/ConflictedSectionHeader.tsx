interface ConflictedSectionHeaderProps {
  count: number
  selectedCount: number
  onBulkUpdate: () => void
}

export function ConflictedSectionHeader({ count, selectedCount, onBulkUpdate }: Readonly<ConflictedSectionHeaderProps>) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">Conflicted</span>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{count}</span>
      </div>
      {selectedCount > 0 && (
        <button
          onClick={onBulkUpdate}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          data-testid="bulk-update-button"
        >
          Bulk Update ({selectedCount})
        </button>
      )}
    </div>
  )
}
