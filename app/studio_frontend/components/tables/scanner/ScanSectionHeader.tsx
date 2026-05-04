interface ScanSectionHeaderProps {
  title: string
  count: number
}

export function ScanSectionHeader({ title, count }: Readonly<ScanSectionHeaderProps>) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" data-testid="section-count">
        {count}
      </span>
    </div>
  )
}
