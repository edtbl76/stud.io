'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Tool } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'
import type { BulkEditField } from '@/lib/bulkEdit'

export const toolBulkEditFields: BulkEditField[] = [
  { key: 'tool_type_ids', label: 'Tool Types', type: 'multiselect', configSlug: 'tool-types' },
  { key: 'plugin_format_ids', label: 'Plugin Formats', type: 'multiselect', configSlug: 'plugin-formats' },
  { key: 'tag_ids', label: 'Tags', type: 'multiselect', configSlug: 'tag-types' },
  { key: 'version', label: 'Version', type: 'text' },
]

export const toolColumns: ColumnDef<Tool, unknown>[] = [
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
