'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Instrument } from '@/lib/types'
import '@/lib/columnMeta'
import { ARRAY_FILTER_OPERATORS, DATE_FILTER_OPERATORS } from '@/lib/filterOperators'
import { TypeBadges } from '@/components/TypeBadges'
import { ParentLinks } from '@/components/ParentLinks'
import type { BulkEditField } from '@/lib/bulkEdit'
import type { SortField } from '@/lib/sort'
import { formatDate } from '@/lib/utils'

export const instrumentSortFields: SortField[] = [
  { key: 'instrument_name', label: 'Instrument Name' },
  { key: 'brand_name', label: 'Brand' },
  { key: 'version', label: 'Version' },
  { key: 'updated_at', label: 'Updated' },
  { key: 'created_at', label: 'Added' },
]

export const instrumentBulkEditFields: BulkEditField[] = [
  { key: 'instrument_type_ids', label: 'Instrument Types', type: 'multiselect', configSlug: 'instrument-types' },
  { key: 'plugin_format_ids', label: 'Plugin Formats', type: 'multiselect', configSlug: 'plugin-formats' },
  { key: 'tag_ids', label: 'Tags', type: 'multiselect', configSlug: 'tag-types' },
  { key: 'version', label: 'Version', type: 'text' },
  { key: 'parent_ids', label: 'Parents', type: 'parentsearch' },
]

export const instrumentColumns: ColumnDef<Instrument, unknown>[] = [
  {
    accessorKey: 'full_instrument_name',
    header: 'Name',
    size: 300,
    meta: { filterParam: 'name' },
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
    meta: { filterParam: 'types', filterOperators: ARRAY_FILTER_OPERATORS },
    cell: ({ row }) => <TypeBadges types={row.original.instrument_types} />,
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
    id: 'models',
    accessorFn: (row) => row.models?.map((m) => m.name).join(' ') ?? '',
    header: 'Models',
    size: 200,
    enableSorting: false,
    meta: { filterParam: 'models', filterOperators: ARRAY_FILTER_OPERATORS },
    cell: ({ row }) => <TypeBadges types={row.original.models} />,
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
  {
    id: 'tags',
    accessorFn: (row) => row.tags?.map((t) => t.name).join(' ') ?? '',
    header: 'Tags',
    size: 220,
    enableSorting: false,
    meta: { filterParam: 'tags', filterOperators: ARRAY_FILTER_OPERATORS },
    cell: ({ row }) => <TypeBadges types={row.original.tags} limit={3} />,
  },
  {
    id: 'parents',
    accessorFn: (row) => row.parents?.map((p) => p.name ?? p.id).join(' ') ?? '',
    header: 'Parents',
    size: 220,
    enableSorting: false,
    meta: { defaultHidden: true },
    cell: ({ row }) => <ParentLinks parents={row.original.parents} />,
  },
]
