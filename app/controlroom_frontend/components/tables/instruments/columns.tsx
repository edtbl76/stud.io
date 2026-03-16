'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Instrument } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'

export const instrumentColumns: ColumnDef<Instrument, unknown>[] = [
  {
    accessorKey: 'full_instrument_name',
    header: 'Name',
    cell: ({ getValue }) => (
      <span className="font-medium text-foreground">{getValue() as string}</span>
    ),
  },
  {
    id: 'types',
    header: 'Types',
    enableSorting: false,
    cell: ({ row }) => <TypeBadges types={row.original.instrument_types} />,
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
