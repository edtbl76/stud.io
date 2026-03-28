'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Effect } from '@/lib/types'
import '@/lib/columnMeta'
import { TypeBadges } from '@/components/TypeBadges'
import type { BulkEditField } from '@/lib/bulkEdit'
import type { SortField } from '@/lib/sort'
import { formatDate } from '@/lib/utils'

export const effectSortFields: SortField[] = [
  { key: 'effect_name', label: 'Effect Name' },
  { key: 'brand_name', label: 'Brand' },
  { key: 'collection', label: 'Collection' },
  { key: 'version', label: 'Version' },
  { key: 'updated_at', label: 'Updated' },
  { key: 'created_at', label: 'Added' },
]

export const effectBulkEditFields: BulkEditField[] = [
  { key: 'effect_type_ids', label: 'Effect Types', type: 'multiselect', configSlug: 'effect-types' },
  { key: 'plugin_format_ids', label: 'Plugin Formats', type: 'multiselect', configSlug: 'plugin-formats' },
  { key: 'tag_ids', label: 'Tags', type: 'multiselect', configSlug: 'tag-types' },
  { key: 'version', label: 'Version', type: 'text' },
]

export const effectColumns: ColumnDef<Effect, unknown>[] = [
  {
    accessorKey: 'full_effect_name',
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
    accessorFn: (row) => row.effect_types?.map((t) => t.name).join(' ') ?? '',
    header: 'Types',
    size: 220,
    enableSorting: false,
    meta: { filterParam: 'types' },
    cell: ({ row }) => <TypeBadges types={row.original.effect_types} />,
  },
  {
    accessorKey: 'collection',
    header: 'Collection',
    size: 180,
    meta: { filterParam: 'collection' },
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
    meta: { filterParam: 'models' },
    cell: ({ row }) => <TypeBadges types={row.original.models} />,
  },
  {
    accessorKey: 'created_at',
    header: 'Added',
    size: 120,

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
    meta: { filterParam: 'tags' },
    cell: ({ row }) => <TypeBadges types={row.original.tags} limit={3} />,
  },
]
