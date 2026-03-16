'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Instrument } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'

export const instrumentColumns: ColumnDef<Instrument, unknown>[] = [
  {
    accessorKey: 'full_instrument_name',
    header: 'Name',
    size: 300,
    cell: ({ getValue }) => {
      const val = getValue() as string
      return <span className="font-medium text-foreground" title={val}>{val}</span>
    },
  },
  {
    id: 'types',
    accessorFn: (row) => row.instrument_types?.map((t) => t.name).join(' ') ?? '',
    header: 'Types',
    size: 220,
    enableSorting: false,
    cell: ({ row }) => <TypeBadges types={row.original.instrument_types} />,
  },
  {
    accessorKey: 'version',
    header: 'Version',
    size: 100,
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
    id: 'models',
    accessorFn: (row) => row.models?.map((m) => m.name).join(' ') ?? '',
    header: 'Models',
    size: 200,
    enableSorting: false,
    cell: ({ row }) => <TypeBadges types={row.original.models} />,
  },
  {
    id: 'tags',
    accessorFn: (row) => row.tags?.map((t) => t.name).join(' ') ?? '',
    header: 'Tags',
    size: 220,
    enableSorting: false,
    cell: ({ row }) => <TypeBadges types={row.original.tags} limit={3} />,
  },
]
