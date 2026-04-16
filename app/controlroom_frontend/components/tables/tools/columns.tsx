'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Tool } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'
import { ARRAY_FILTER_OPERATORS, DATE_FILTER_OPERATORS } from '@/lib/filterOperators'
import type { SortField } from '@/lib/sort'
import '@/lib/columnMeta'
import { formatDate } from '@/lib/utils'
import { renderMutedText } from '@/lib/columnUtils'

export const toolSortFields: SortField[] = [
  { key: 'full_tool_name', label: 'Name' },
  { key: 'brand_name', label: 'Brand' },
  { key: 'version', label: 'Version' },
  { key: 'updated_at', label: 'Updated' },
  { key: 'created_at', label: 'Added' },
]

export { workstationBulkEditFields as toolBulkEditFields } from '@/components/tables/workstations/columns'

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
    accessorKey: 'brand_name',
    header: 'Brand',
    size: 180,
    meta: { filterParam: 'brand' },
    cell: ({ getValue }) => renderMutedText(getValue() as string | null),
  },
  {
    id: 'models',
    accessorFn: (row) => row.models?.map((m) => m.name).join(' ') ?? '',
    header: 'Models',
    size: 200,
    enableSorting: false,
    meta: { filterParam: 'models', filterOperators: ARRAY_FILTER_OPERATORS },
    cell: ({ row }) => <TypeBadges types={row.original.models} />,
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
