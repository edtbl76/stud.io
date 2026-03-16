'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Workstation } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'

export const workstationColumns: ColumnDef<Workstation, unknown>[] = [
  {
    accessorKey: 'full_tool_name',
    header: 'Name',
    size: 260,
    cell: ({ getValue }) => (
      <span className="font-medium text-foreground">{getValue() as string}</span>
    ),
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
    id: 'types',
    accessorFn: (row) => row.tool_types?.map((t) => t.name).join(' ') ?? '',
    header: 'Types',
    size: 200,
    enableSorting: false,
    cell: ({ row }) => <TypeBadges types={row.original.tool_types} />,
  },
  {
    id: 'formats',
    accessorFn: (row) => row.plugin_formats?.map((t) => t.name).join(' ') ?? '',
    header: 'Formats',
    size: 200,
    enableSorting: false,
    cell: ({ row }) => <TypeBadges types={row.original.plugin_formats} />,
  },
]
