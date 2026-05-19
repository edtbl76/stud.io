interface ScanSectionHeaderProps {
  title: string
  count: number
  hideConfirmed?: boolean
  onToggleHideConfirmed?: () => void
}

export function ScanSectionHeader({ title, count, hideConfirmed, onToggleHideConfirmed }: Readonly<ScanSectionHeaderProps>) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" data-testid="section-count">
        {count}
      </span>
      {onToggleHideConfirmed && (
        <button
          onClick={onToggleHideConfirmed}
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          data-testid="toggle-hide-confirmed"
        >
          {hideConfirmed ? 'Show confirmed' : 'Hide confirmed'}
        </button>
      )}
    </div>
  )
}
