'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Model } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'

export const modelColumns: ColumnDef<Model, unknown>[] = [
  {
    accessorKey: 'full_model_name',
    header: 'Name',
    cell: ({ getValue }) => (
      <span className="font-medium text-foreground">{getValue() as string}</span>
    ),
  },
  {
    id: 'types',
    accessorKey: 'model_types',
    header: 'Types',
    enableSorting: false,
    cell: ({ row }) => <TypeBadges types={row.original.model_types} />,
  },
  {
    accessorKey: 'years_active',
    header: 'Years Active',
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
    accessorKey: 'creator',
    header: 'Creator',
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      return val ? (
        <span className="text-muted-foreground text-xs">{val}</span>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )
    },
  },
]
