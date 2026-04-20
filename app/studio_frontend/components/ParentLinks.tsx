import * as React from 'react'
import { ParentRef } from '@/lib/types'

interface ParentLinksProps {
  parents: ParentRef[] | null | undefined
}

export function ParentLinks({ parents }: Readonly<ParentLinksProps>) {
  if (!parents || parents.length === 0) {
    return <span className="text-muted-foreground italic">—</span>
  }

  return (
    <div className="flex flex-col gap-1">
      {parents.map((p, i) => (
        <span
          key={`${p.table_name}-${p.id}-${i}`}
          className="text-sm text-primary hover:text-primary/80 cursor-default"
          title={`${p.table_name} / ${p.id}`}
        >
          <span className="text-muted-foreground text-xs">{p.table_name}: </span>
          {p.name ?? p.id}
        </span>
      ))}
    </div>
  )
}
