'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Workstation } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'
import type { BulkEditField } from '@/lib/bulkEdit'
import type { SortField } from '@/lib/sort'
import '@/lib/columnMeta'

export const workstationSortFields: SortField[] = [
  { key: 'full_tool_name', label: 'Name' },
  { key: 'brand_name', label: 'Brand' },
  { key: 'version', label: 'Version' },
]

export const workstationBulkEditFields: BulkEditField[] = [
  { key: 'tool_type_ids', label: 'Tool Types', type: 'multiselect', configSlug: 'tool-types' },
  { key: 'plugin_format_ids', label: 'Plugin Formats', type: 'multiselect', configSlug: 'plugin-formats' },
  { key: 'tag_ids', label: 'Tags', type: 'multiselect', configSlug: 'tag-types' },
  { key: 'version', label: 'Version', type: 'text' },
]

export const workstationColumns: ColumnDef<Workstation, unknown>[] = [
  {
    accessorKey: 'full_tool_name',
    header: 'Name',
    size: 260,
    meta: { filterParam: 'name' },
    cell: ({ getValue }) => (
      <span className="font-medium text-foreground">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: 'version',
    header: 'Version',
    size: 100,
    meta: { filterParam: 'version' },
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
    meta: { filterParam: 'types' },
    cell: ({ row }) => <TypeBadges types={row.original.tool_types} />,
  },
  {
    id: 'formats',
    accessorFn: (row) => row.plugin_formats?.map((t) => t.name).join(' ') ?? '',
    header: 'Formats',
    size: 200,
    enableSorting: false,
    meta: { filterParam: 'formats' },
    cell: ({ row }) => <TypeBadges types={row.original.plugin_formats} />,
  },
]
