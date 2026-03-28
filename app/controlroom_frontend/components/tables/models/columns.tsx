'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Model } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'
import type { BulkEditField } from '@/lib/bulkEdit'
import type { SortField } from '@/lib/sort'
import '@/lib/columnMeta'
import { formatDate } from '@/lib/utils'

export const modelSortFields: SortField[] = [
  { key: 'model_name', label: 'Model Name' },
  { key: 'brand_name', label: 'Brand' },
  { key: 'updated_at', label: 'Updated' },
  { key: 'created_at', label: 'Added' },
]

export const modelBulkEditFields: BulkEditField[] = [
  { key: 'model_type_ids', label: 'Model Types', type: 'multiselect', configSlug: 'model-types' },
]

export const modelColumns: ColumnDef<Model, unknown>[] = [
  {
    accessorKey: 'full_model_name',
    header: 'Name',
    size: 340,
    meta: { filterParam: 'name' },
    cell: ({ getValue }) => {
      const val = getValue() as string
      return <span className="font-medium text-foreground" title={val}>{val}</span>
    },
  },
  {
    id: 'types',
    accessorFn: (row) => row.model_types?.map((t) => t.name).join(' ') ?? '',
    header: 'Types',
    size: 200,
    enableSorting: false,
    meta: { filterParam: 'types' },
    cell: ({ row }) => <TypeBadges types={row.original.model_types} />,
  },
  {
    accessorKey: 'years_active',
    header: 'Years Active',
    size: 130,
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
    accessorKey: 'creator',
    header: 'Creator',
    size: 160,
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
]
