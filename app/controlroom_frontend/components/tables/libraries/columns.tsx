'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Library } from '@/lib/types'
import '@/lib/columnMeta'
import { ARRAY_FILTER_OPERATORS, DATE_FILTER_OPERATORS } from '@/lib/filterOperators'
import { TypeBadges } from '@/components/TypeBadges'
import { ParentLinks } from '@/components/ParentLinks'
import type { BulkEditField } from '@/lib/bulkEdit'
import type { SortField } from '@/lib/sort'
import { formatDate } from '@/lib/utils'

export const librarySortFields: SortField[] = [
  { key: 'library_name', label: 'Library Name' },
  { key: 'brand_name', label: 'Brand' },
  { key: 'updated_at', label: 'Updated' },
  { key: 'created_at', label: 'Added' },
]

export const libraryBulkEditFields: BulkEditField[] = [
  { key: 'tag_ids', label: 'Tags', type: 'multiselect', configSlug: 'tag-types' },
  { key: 'parent_ids', label: 'Parents', type: 'parentsearch' },
]

export const libraryColumns: ColumnDef<Library, unknown>[] = [
  {
    accessorKey: 'full_library_name',
    header: 'Name',
    size: 320,
    meta: { filterParam: 'name' },
    cell: ({ getValue }) => {
      const val = getValue() as string
      return <span className="font-medium text-foreground" title={val}>{val}</span>
    },
  },
  {
    accessorKey: 'brand_name',
    header: 'Brand',
    size: 180,
    meta: { filterParam: 'brand' },
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
    meta: { defaultHidden: true, filterParam: 'parents', filterOperators: ['is_empty', 'is_not_empty'] as const },
    cell: ({ row }) => <ParentLinks parents={row.original.parents} />,
  },
]
