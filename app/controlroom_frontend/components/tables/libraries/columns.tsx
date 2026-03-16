'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Library } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'

export const libraryColumns: ColumnDef<Library, unknown>[] = [
  {
    accessorKey: 'full_library_name',
    header: 'Name',
    cell: ({ getValue }) => (
      <span className="font-medium text-foreground">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: 'brand_name',
    header: 'Brand',
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
