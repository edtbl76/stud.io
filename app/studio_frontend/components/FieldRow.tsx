import * as React from 'react'
import { cn } from '@/lib/utils'

interface FieldRowProps {
  label: string
  value: React.ReactNode
  className?: string
}

export function FieldRow({ label, value, className }: Readonly<FieldRowProps>) {
  const isEmpty =
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <div className="text-sm text-foreground min-h-[1.25rem]">
        {isEmpty ? (
          <span className="text-muted-foreground italic">—</span>
        ) : (
          value
        )}
      </div>
    </div>
  )
}
