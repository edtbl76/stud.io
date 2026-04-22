'use client'

import * as React from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

interface TableStat {
  name: string
  count: number
  pending_creates: number
  pending_deletes: number
  pending_updates: number
}

interface StatGroup {
  label: string
  tables: TableStat[]
}

interface StatsResponse {
  groups: StatGroup[]
  total: number
}

export default function StatsPage() {
  const [data, setData] = React.useState<StatsResponse | null>(null)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    fetch('/api/studio/admin/stats')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch stats')
        return res.json() as Promise<StatsResponse>
      })
      .then(setData)
      .catch(() => setError(true))
  }, [])

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Could not load stats.
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center px-6 py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="px-6 py-6 max-w-sm">
      <h2 className="text-lg font-semibold text-foreground mb-6">Stats</h2>

      {data.groups.map((group) => (
        <section key={group.label} className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {group.label}
          </div>
          {group.tables.map((table) => {
            const annotations: string[] = []
            if (table.pending_updates > 0) {
              annotations.push(
                `${table.pending_updates} pending ${table.pending_updates === 1 ? 'update' : 'updates'}`
              )
            }
            if (table.pending_creates > 0) {
              annotations.push(
                `${table.pending_creates} pending ${table.pending_creates === 1 ? 'addition' : 'additions'}`
              )
            }
            if (table.pending_deletes > 0) {
              annotations.push(
                `${table.pending_deletes} pending ${table.pending_deletes === 1 ? 'deletion' : 'deletions'}`
              )
            }

            return (
              <div key={table.name} className="flex justify-between text-xs py-0.5">
                <span className="text-foreground">{table.name}</span>
                <span className="font-mono text-muted-foreground text-right">
                  {table.count.toLocaleString()}
                  {annotations.length > 0 && (
                    <span className="ml-1 text-amber-500 font-normal">
                      ({annotations.join(', ')})
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </section>
      ))}

      <div className="border-t border-border pt-2 flex justify-between text-xs text-muted-foreground">
        <span>Total</span>
        <span className="font-mono">{data.total.toLocaleString()}</span>
      </div>
    </div>
  )
}
