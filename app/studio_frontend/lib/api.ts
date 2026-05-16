import type { CatalogSearchResult, ConfirmDecision, Exclusion, ScannerApiKeyCreated, ScannerApiKeyResponse, ScanReport, ScanRun, SearchResponse } from '@/lib/types'
import { DEFAULT_OPERATOR, VALUE_FREE_OPERATORS, DATE_RANGE_OPERATORS, type FilterState } from '@/lib/filterOperators'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

function appendFilters(p: URLSearchParams, filters: FilterState) {
  for (const [key, entry] of Object.entries(filters)) {
    const { value, operator, value_end } = entry
    if (VALUE_FREE_OPERATORS.has(operator)) {
      p.set(`filter_${key}_op`, operator)
    } else {
      if (!value) continue
      p.set(`filter_${key}`, value)
      if (operator !== DEFAULT_OPERATOR) p.set(`filter_${key}_op`, operator)
      if (DATE_RANGE_OPERATORS.has(operator) && value_end) p.set(`filter_${key}_end`, value_end)
    }
  }
}

export const api = {
  list:   <T>(ep: string, q?: string) => req<T[]>(q ? `${ep}?q=${encodeURIComponent(q)}` : ep),
  listPaged: <T>(ep: string, params: { limit?: number; offset?: number; sort_by?: string[]; sort_dir?: string[]; filters?: FilterState }) => {
    const p = new URLSearchParams()
    if (params.limit !== undefined) p.set('limit', String(params.limit))
    if (params.offset !== undefined) p.set('offset', String(params.offset))
    params.sort_by?.forEach((k) => p.append('sort_by', k))
    params.sort_dir?.forEach((d) => p.append('sort_dir', d))
    if (params.filters) appendFilters(p, params.filters)
    const qs = p.toString()
    const sep = ep.includes('?') ? '&' : '?'
    return req<{ items: T[]; total: number }>(qs ? `${ep}${sep}${qs}` : ep)
  },
  get:    <T>(ep: string, id: string) => req<T>(`${ep}/${id}`),
  create: <T>(ep: string, body: unknown) => req<T>(ep, { method: 'POST', body: JSON.stringify(body) }),
  update: <T>(ep: string, id: string, body: unknown) => req<T>(`${ep}/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (ep: string, id: string) => req<void>(`${ep}/${id}`, { method: 'DELETE' }),
  uploadPhoto: (ep: string, id: string, file: File) =>
    req<{ photo_key: string }>(`${ep}/${id}/photo`, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type },
    }),
  searchGlobal: (q: string, notes = false) =>
    req<SearchResponse>(`/search?q=${encodeURIComponent(q)}&notes=${notes}`),
  searchEntities: (q: string, excludeTable = '', excludeId = '') => {
    const p = new URLSearchParams({ q })
    if (excludeTable) p.set('exclude_table', excludeTable)
    if (excludeId) p.set('exclude_id', excludeId)
    return req<{ results: Array<{ table_name: string; id: string; name: string; brand_name: string | null }> }>(`/search/entities?${p}`)
  },
  scanner: {
    runs: () => req<ScanRun[]>('/scanner/scans'),
    report: (scanId?: string) => {
      const qs = scanId ? `?scan_id=${encodeURIComponent(scanId)}` : ''
      return req<ScanReport>(`/scanner/report${qs}`)
    },
    confirm: (decisions: ConfirmDecision[]) =>
      req<{ applied: number; errors: unknown[] }>('/scanner/confirm', {
        method: 'POST', body: JSON.stringify({ confirmations: decisions }),
      }),
    acknowledge: (resultId: string) => {
      const decision: ConfirmDecision = { result_id: resultId, action: 'acknowledge' }
      return req<{ applied: number; errors: unknown[] }>('/scanner/confirm', {
        method: 'POST', body: JSON.stringify({ confirmations: [decision] }),
      })
    },
    force: (resultId: string, targetId: string, targetTable: string) => {
      const decision: ConfirmDecision = { result_id: resultId, action: 'force', target_id: targetId, target_table: targetTable }
      return req<{ applied: number; errors: unknown[] }>('/scanner/confirm', {
        method: 'POST', body: JSON.stringify({ confirmations: [decision] }),
      })
    },
    catalogSearch: (q: string, table?: string) => {
      const params = new URLSearchParams({ q })
      if (table) params.set('table', table)
      return req<CatalogSearchResult[]>(`/scanner/catalog/search?${params}`)
    },
    dismiss: (resultId: string) =>
      req<void>(`/scanner/results/${resultId}/dismiss`, { method: 'PATCH' }),
    keep: (resultId: string) =>
      req<void>(`/scanner/results/${resultId}/keep`, { method: 'PATCH' }),
    exclusions: () => req<Exclusion[]>('/scanner/exclusions'),
    removeExclusion: (exclusionId: string) =>
      req<void>(`/scanner/exclude/${exclusionId}`, { method: 'DELETE' }),
    listKeys: () => req<ScannerApiKeyResponse[]>('/scanner/keys'),
    createKey: (label: string) =>
      req<ScannerApiKeyCreated>('/scanner/keys', { method: 'POST', body: JSON.stringify({ label }) }),
    revokeKey: (keyId: string) => req<void>(`/scanner/keys/${keyId}`, { method: 'DELETE' }),
    purge: (olderThanDays: number | 'all') => {
      const qs = olderThanDays === 'all' ? '' : `?older_than_days=${olderThanDays}`
      return req<{ deleted_count: number }>(`/scanner/scans${qs}`, { method: 'DELETE' })
    },
  },
}
