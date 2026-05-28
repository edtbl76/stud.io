'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { catalogRecordPath } from '@/lib/catalogNavigation'
import type { WorkbenchRow } from '@/lib/types'

function sortKnownRows(rows: WorkbenchRow[]): WorkbenchRow[] {
  return [...rows].sort((a, b) => {
    const tableA = (a.catalog_record_table ?? '').toLowerCase()
    const tableB = (b.catalog_record_table ?? '').toLowerCase()
    const tableCmp = tableA.localeCompare(tableB)
    if (tableCmp !== 0) return tableCmp
    const nameA = (a.catalog_record_name ?? '').toLowerCase()
    const nameB = (b.catalog_record_name ?? '').toLowerCase()
    return nameA.localeCompare(nameB)
  })
}

function KnownNameCell({ row }: Readonly<{ row: WorkbenchRow }>) {
  if (!row.catalog_record_table || !row.catalog_record_id) {
    return <span>{row.catalog_record_name}</span>
  }
  const path = catalogRecordPath(row.catalog_record_table, row.catalog_record_id)
  if (!path) return <span>{row.catalog_record_name}</span>
  return (
    <a href={path} data-testid="known-row-link">
      {row.catalog_record_name}
    </a>
  )
}

export function KnownPage() {
  const [rows, setRows] = useState<WorkbenchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.scanner.workbench({ bucket: 'known' })
      .then(data => setRows(sortKnownRows(data.rows)))
      .catch(() => setError('Failed to load known records'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div data-testid="known-loading" className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
  }

  if (error) {
    return <div data-testid="known-error" className="p-4 text-destructive">{error}</div>
  }

  if (rows.length === 0) {
    return <div data-testid="known-empty-state" className="py-12 text-center text-sm text-muted-foreground">No known records found.</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-2">Catalog Type</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Vendor</th>
            <th className="px-3 py-2">Format</th>
            <th className="px-3 py-2">Disk Name</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.result_id} data-testid="known-row" className="border-b hover:bg-muted/50">
              <td className="px-3 py-2">{row.catalog_record_table}</td>
              <td className="px-3 py-2"><KnownNameCell row={row} /></td>
              <td className="px-3 py-2">{row.catalog_record_vendor ?? '—'}</td>
              <td className="px-3 py-2">{row.disk_format}</td>
              <td className="px-3 py-2">{row.disk_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
