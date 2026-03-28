'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Tool } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'
import { ARRAY_FILTER_OPERATORS, DATE_FILTER_OPERATORS } from '@/lib/filterOperators'
import type { BulkEditField } from '@/lib/bulkEdit'
import type { SortField } from '@/lib/sort'
import '@/lib/columnMeta'
import { formatDate } from '@/lib/utils'

export const toolSortFields: SortField[] = [
  { key: 'full_tool_name', label: 'Name' },
  { key: 'brand_name', label: 'Brand' },
  { key: 'version', label: 'Version' },
  { key: 'updated_at', label: 'Updated' },
  { key: 'created_at', label: 'Added' },
]

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
    meta: { filterParam: 'types', filterOperators: ARRAY_FILTER_OPERATORS },
    cell: ({ row }) => <TypeBadges types={row.original.tool_types} />,
  },
  {
    id: 'formats',
    accessorFn: (row) => row.plugin_formats?.map((t) => t.name).join(' ') ?? '',
    header: 'Formats',
    size: 200,
    enableSorting: false,
    meta: { filterParam: 'formats', filterOperators: ARRAY_FILTER_OPERATORS },
    cell: ({ row }) => <TypeBadges types={row.original.plugin_formats} />,
  },
  {
    accessorKey: 'created_at',
    header: 'Added',
    size: 120,
    meta: { filterOperators: DATE_FILTER_OPERATORS },
    cell: ({ getValue }) => (
      <span className="text-muted-foreground text-xs" title={getValue() as string}>
        {formatDate(getValue() as string)}
      </span>
    ),
  },
  {
    accessorKey: 'updated_at',
    header: 'Updated',
    size: 120,
    meta: { filterOperators: DATE_FILTER_OPERATORS },
    cell: ({ getValue }) => (
      <span className="text-muted-foreground text-xs" title={getValue() as string}>
        {formatDate(getValue() as string)}
      </span>
    ),
  },
]
