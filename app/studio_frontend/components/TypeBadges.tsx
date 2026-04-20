import * as React from 'react'
import { TypeRef } from '@/lib/types'
import { Badge } from '@/components/ui/badge'

interface TypeBadgesProps {
  types: TypeRef[] | null | undefined
  limit?: number
}

export function TypeBadges({ types, limit }: Readonly<TypeBadgesProps>) {
  if (!types || types.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }

  const displayed = limit ? types.slice(0, limit) : types
  const remaining = limit ? types.length - limit : 0

  return (
    <div className="flex flex-wrap gap-1">
      {displayed.map(t => (
        <Badge key={t.id} variant="secondary">
          {t.name}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="secondary" className="text-muted-foreground">
          +{remaining}
        </Badge>
      )}
    </div>
  )
}
