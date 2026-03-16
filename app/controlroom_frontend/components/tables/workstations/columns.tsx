'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Workstation } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'

export const workstationColumns: ColumnDef<Workstation, unknown>[] = [
  {
    accessorKey: 'full_tool_name',
    header: 'Name',
    cell: ({ getValue }) => (
      <span className="font-medium text-foreground">{getValue() as string}</span>
    ),
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
    id: 'types',
    header: 'Types',
    enableSorting: false,
    cell: ({ row }) => <TypeBadges types={row.original.tool_types} />,
  },
  {
    id: 'formats',
    header: 'Formats',
    enableSorting: false,
    cell: ({ row }) => <TypeBadges types={row.original.plugin_formats} />,
  },
]
