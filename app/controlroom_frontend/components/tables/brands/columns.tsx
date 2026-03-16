'use client'

import { ColumnDef } from '@tanstack/react-table'
import { ExternalLink } from 'lucide-react'
import { Brand } from '@/lib/types'

export const brandColumns: ColumnDef<Brand, unknown>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.brand_name ?? row.legal_name,
    header: 'Name',
    size: 200,
    cell: ({ getValue }) => {
      const val = getValue() as string
      return <span className="font-medium text-foreground" title={val}>{val}</span>
    },
  },
  {
    accessorKey: 'legal_name',
    header: 'Legal Name',
    size: 240,
    cell: ({ getValue }) => {
      const val = getValue() as string
      return <span className="text-muted-foreground" title={val}>{val}</span>
    },
  },
  {
    id: 'type',
    accessorKey: 'entity_type_name',
    header: 'Type',
    size: 140,
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      return val ? (
        <span className="text-xs text-muted-foreground">{val}</span>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )
    },
  },
  {
    accessorKey: 'website',
    header: 'Website',
    size: 200,
    cell: ({ getValue }) => {
      const url = getValue() as string | null
      if (!url) return <span className="text-muted-foreground/40">—</span>
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-primary hover:underline text-xs"
        >
          {url.replace(/^https?:\/\//, '').split('/')[0]}
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
      )
    },
  },
  {
    accessorKey: 'founder',
    header: 'Founder',
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
    accessorKey: 'years',
    header: 'Years',
    size: 120,
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      return val ? (
        <span className="text-muted-foreground text-xs">{val}</span>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )
    },
  },
]
