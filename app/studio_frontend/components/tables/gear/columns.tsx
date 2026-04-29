'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Gear } from '@/lib/types'
import '@/lib/columnMeta'
import { DATE_FILTER_OPERATORS, TEXT_FILTER_OPERATORS } from '@/lib/filterOperators'
import type { SortField } from '@/lib/sort'
import { formatDate } from '@/lib/utils'

export const gearSortFields: SortField[] = [
  { key: 'gear_name',   label: 'Name'    },
  { key: 'serial_number', label: 'Serial' },
  { key: 'year',        label: 'Year'    },
  { key: 'updated_at',  label: 'Updated' },
  { key: 'created_at',  label: 'Added'   },
]

export const gearColumns: ColumnDef<Gear, unknown>[] = [
  {
    accessorKey: 'gear_name',
    header: 'Name',
    size: 240,
    meta: { filterParam: 'name', filterOperators: TEXT_FILTER_OPERATORS },
    cell: ({ getValue }) => (
      <span className="font-medium text-foreground">{getValue() as string}</span>
    ),
  },
  {
    id: 'type',
    accessorKey: 'gear_type_name',
    header: 'Type',
    size: 140,
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      return val
        ? <span className="text-xs text-muted-foreground">{val}</span>
        : <span className="text-muted-foreground/40">—</span>
    },
  },
  {
    accessorKey: 'serial_number',
    header: 'Serial',
    size: 160,
    meta: { filterParam: 'serial_number', filterOperators: TEXT_FILTER_OPERATORS },
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      return val
        ? <span className="text-xs font-mono text-muted-foreground">{val}</span>
        : <span className="text-muted-foreground/40">—</span>
    },
  },
  {
    accessorKey: 'year',
    header: 'Year',
    size: 80,
    cell: ({ getValue }) => {
      const val = getValue() as number | null
      return val
        ? <span className="text-xs text-muted-foreground">{val}</span>
        : <span className="text-muted-foreground/40">—</span>
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Added',
    size: 120,
    meta: { filterOperators: DATE_FILTER_OPERATORS },
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">{formatDate(getValue() as string)}</span>
    ),
  },
  {
    accessorKey: 'updated_at',
    header: 'Updated',
    size: 120,
    meta: { filterOperators: DATE_FILTER_OPERATORS },
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">{formatDate(getValue() as string)}</span>
    ),
  },
]
