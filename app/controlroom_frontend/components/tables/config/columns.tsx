'use client'

import { ColumnDef } from '@tanstack/react-table'
import { LookupOut } from '@/lib/types'

export const configColumns: ColumnDef<LookupOut, unknown>[] = [
  {
    accessorKey: 'type_name',
    header: 'Name',
    size: 200,
    cell: ({ getValue }) => (
      <span className="font-medium text-foreground">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: 'type_description',
    header: 'Description',
    size: 400,
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      return val ? (
        <span className="text-muted-foreground text-sm">{val}</span>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )
    },
  },
]
