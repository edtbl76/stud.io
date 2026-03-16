'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Model } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'

export const modelColumns: ColumnDef<Model, unknown>[] = [
  {
    accessorKey: 'full_model_name',
    header: 'Name',
    size: 340,
    cell: ({ getValue }) => {
      const val = getValue() as string
      return <span className="font-medium text-foreground" title={val}>{val}</span>
    },
  },
  {
    id: 'types',
    accessorFn: (row) => row.model_types?.map((t) => t.name).join(' ') ?? '',
    header: 'Types',
    size: 200,
    enableSorting: false,
    cell: ({ row }) => <TypeBadges types={row.original.model_types} />,
  },
  {
    accessorKey: 'years_active',
    header: 'Years Active',
    size: 130,
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
    size: 160,
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
