'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Effect } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'

export const effectColumns: ColumnDef<Effect, unknown>[] = [
  {
    accessorKey: 'full_effect_name',
    header: 'Name',
    cell: ({ getValue }) => (
      <span className="font-medium text-foreground">{getValue() as string}</span>
    ),
  },
  {
    id: 'types',
    header: 'Types',
    enableSorting: false,
    cell: ({ row }) => <TypeBadges types={row.original.effect_types} />,
  },
  {
    accessorKey: 'collection',
    header: 'Collection',
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      return val ? (
        <span className="text-muted-foreground text-xs">{val}</span>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )
    },
  },
  {
    accessorKey: 'version',
    header: 'Version',
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      return val ? (
        <span className="text-muted-foreground text-xs">{val}</span>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )
    },
  },
  {
    id: 'tags',
    header: 'Tags',
    enableSorting: false,
    cell: ({ row }) => <TypeBadges types={row.original.tags} limit={3} />,
  },
]
