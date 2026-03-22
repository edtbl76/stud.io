'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Library } from '@/lib/types'
import { TypeBadges } from '@/components/TypeBadges'
import type { BulkEditField } from '@/lib/bulkEdit'
import type { SortField } from '@/lib/sort'

export const librarySortFields: SortField[] = [
  { key: 'library_name', label: 'Library Name' },
  { key: 'brand_name', label: 'Brand' },
  { key: 'updated_at', label: 'Recently Updated' },
]

export const libraryBulkEditFields: BulkEditField[] = [
  { key: 'tag_ids', label: 'Tags', type: 'multiselect', configSlug: 'tag-types' },
]

export const libraryColumns: ColumnDef<Library, unknown>[] = [
  {
    accessorKey: 'full_library_name',
    header: 'Name',
    size: 320,
    cell: ({ getValue }) => {
      const val = getValue() as string
      return <span className="font-medium text-foreground" title={val}>{val}</span>
    },
  },
  {
    accessorKey: 'brand_name',
    header: 'Brand',
    size: 180,
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
    cell: ({ row }) => <TypeBadges types={row.original.models} />,
  },
  {
    id: 'tags',
    accessorFn: (row) => row.tags?.map((t) => t.name).join(' ') ?? '',
    header: 'Tags',
    size: 220,
    enableSorting: false,
    cell: ({ row }) => <TypeBadges types={row.original.tags} limit={3} />,
  },
]
