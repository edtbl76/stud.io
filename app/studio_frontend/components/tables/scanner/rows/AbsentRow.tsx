import type { AbsentRecord } from '@/lib/types'

interface AbsentRowProps {
  record: AbsentRecord
}

export function AbsentRow({ record }: Readonly<AbsentRowProps>) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3 border-b border-border/50 text-sm"
      data-testid={`absent-row-${record.record_id}`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{record.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {record.vendor} · {record.record_table} {record.version ? `· ${record.version}` : ''}
        </p>
      </div>
      {record.disk_paths.length > 0 && (
        <div className="text-xs text-right shrink-0 space-y-0.5">
          {record.disk_paths.map(p => (
            <p key={p.path} className="text-muted-foreground font-mono truncate max-w-[240px]">{p.path}</p>
          ))}
        </div>
      )}
    </div>
  )
}
