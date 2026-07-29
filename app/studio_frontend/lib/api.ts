import type { AcknowledgeResult, AllRules, BulkActionResult, BulkCreateLinkRequest, BulkLinkResult, BulkUpdateResult, CatalogSearchResult, CollisionResolveRequest, CollisionResolveResult, ConfirmDecision, CreateAliasRequest, CreateLinkRequest, Exclusion, FindLinkCandidatesResponse, HardResetResult, NameRuleInput, PatternRuleInput, RawScanReport, RuleCreationResult, RuleType, ScanListItem, ScannerApiKeyCreated, ScannerApiKeyResponse, SearchResponse, SoftResetResult, UpdateRuleInput, VendorRuleInput, WorkbenchResponse, WorkbenchServerParams } from '@/lib/types'
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
  delete: (ep: string, id: string) => req<void>(`${ep}/${id}`, { method: 'DELETE' }), // skipcq: JS-0333 -- void generic arg (Promise<void>) is valid TS
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
    recentScans: () => req<ScanListItem[]>('/scanner/scans/recent'),
    rawReport: (scanId: string) => req<RawScanReport>(`/scanner/scans/${scanId}/report`),
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
    force: ({ resultId, targetId, targetTable }: { resultId: string; targetId: string; targetTable: string }) => {
      const decision: ConfirmDecision = { result_id: resultId, action: 'force', target_id: targetId, target_table: targetTable }
      return req<{ applied: number; errors: unknown[] }>('/scanner/confirm', {
        method: 'POST', body: JSON.stringify({ confirmations: [decision] }),
      })
    },
    catalogSearch: ({ q, table }: { q: string; table?: string }) => {
      const params = new URLSearchParams({ q })
      if (table) params.set('table', table)
      return req<CatalogSearchResult[]>(`/scanner/catalog/search?${params}`)
    },
    dismiss: (resultId: string) =>
      req<void>(`/scanner/results/${resultId}/dismiss`, { method: 'PATCH' }), // skipcq: JS-0333 -- void generic arg (Promise<void>) is valid TS
    resolveCollision: (body: CollisionResolveRequest) =>
      req<CollisionResolveResult>('/scanner/collisions/resolve', {
        method: 'POST', body: JSON.stringify(body),
      }),
    keep: (resultId: string) =>
      req<void>(`/scanner/results/${resultId}/keep`, { method: 'PATCH' }), // skipcq: JS-0333 -- void generic arg (Promise<void>) is valid TS
    exclusions: () => req<Exclusion[]>('/scanner/exclusions'),
    removeExclusion: (exclusionId: string) =>
      req<void>(`/scanner/exclude/${exclusionId}`, { method: 'DELETE' }), // skipcq: JS-0333 -- void generic arg (Promise<void>) is valid TS
    listKeys: () => req<ScannerApiKeyResponse[]>('/scanner/keys'),
    createKey: (label: string) =>
      req<ScannerApiKeyCreated>('/scanner/keys', { method: 'POST', body: JSON.stringify({ label }) }),
    revokeKey: (keyId: string) => req<void>(`/scanner/keys/${keyId}`, { method: 'DELETE' }), // skipcq: JS-0333 -- void generic arg (Promise<void>) is valid TS
    purge: (olderThanDays: number | 'all') => {
      const qs = olderThanDays === 'all' ? '' : `?older_than_days=${olderThanDays}`
      return req<{ deleted_count: number }>(`/scanner/scans${qs}`, { method: 'DELETE' })
    },
    rules: () => req<AllRules>('/scanner/rules'),
    createVendorRule: (input: VendorRuleInput) =>
      req<RuleCreationResult>('/scanner/rules/vendor', { method: 'POST', body: JSON.stringify(input) }),
    createNameRule: (input: NameRuleInput) =>
      req<RuleCreationResult>('/scanner/rules/name', { method: 'POST', body: JSON.stringify(input) }),
    createPatternRule: (input: PatternRuleInput) =>
      req<RuleCreationResult>('/scanner/rules/pattern', { method: 'POST', body: JSON.stringify(input) }),
    updateRule: ({ id, type, catalogValue }: UpdateRuleInput) => {
      const body = type === 'vendor' ? { catalog_vendor: catalogValue } : { catalog_name: catalogValue }
      return req<RuleCreationResult>(`/scanner/rules/${type}/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    },
    deleteRule: (id: string, type: RuleType) =>
      req<void>(`/scanner/rules/${type}/${id}`, { method: 'DELETE' }), // skipcq: JS-0333 -- void generic arg (Promise<void>) is valid TS
    toggleRule: (id: string, type: RuleType, enabled: boolean) =>
      req<RuleCreationResult>(`/scanner/rules/${type}/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
    acknowledgeClean: (id: string, type: RuleType) =>
      req<AcknowledgeResult>(`/scanner/rules/${type}/${id}/acknowledge-clean`, { method: 'POST' }),
    createAlias: (body: CreateAliasRequest) =>
      req<void>('/scanner/aliases', { method: 'POST', body: JSON.stringify(body) }), // skipcq: JS-0333 -- void generic arg (Promise<void>) is valid TS
    workbench: (params: WorkbenchServerParams) => {
      const p = new URLSearchParams()
      if (params.scan_id) p.set('scan_id', params.scan_id)
      if (params.bucket) p.set('bucket', params.bucket)
      if (params.show_confirmed !== undefined) p.set('show_confirmed', String(params.show_confirmed))
      return req<WorkbenchResponse>(`/scanner/workbench?${p.toString()}`)
    },
    findLinkCandidates: (type: 'unlinked' | 'orphaned', sourceId: string, q?: string) => {
      const p = new URLSearchParams({ type, source_id: sourceId })
      if (q) p.set('q', q)
      return req<FindLinkCandidatesResponse>(`/scanner/links/candidates?${p.toString()}`)
    },
    createLink: (body: CreateLinkRequest) =>
      req<BulkLinkResult>('/scanner/links', { method: 'POST', body: JSON.stringify(body) }),
    bulkCreateLinks: (body: BulkCreateLinkRequest) =>
      req<BulkLinkResult>('/scanner/links/bulk', { method: 'POST', body: JSON.stringify(body) }),
    rejectMatch: (resultId: string) =>
      req<void>(`/scanner/results/${resultId}/reject`, { method: 'POST' }), // skipcq: JS-0333 -- void generic arg (Promise<void>) is valid TS
    softReset: () =>
      req<SoftResetResult>('/scanner/admin/reset/soft', { method: 'POST' }),
    hardReset: (confirmationText: string) =>
      req<HardResetResult>('/scanner/admin/reset/hard', {
        method: 'POST',
        body: JSON.stringify({ confirmation_text: confirmationText }),
      }),
    exclude: (vendor: string, name: string, format: string) =>
      req<void>('/scanner/exclude', { method: 'POST', body: JSON.stringify({ vendor, name, format }) }), // skipcq: JS-0333 -- void generic arg (Promise<void>) is valid TS
    bulkUpdate: (resultIds: string[]) =>
      req<BulkUpdateResult>('/scanner/workbench/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ result_ids: resultIds }),
      }),
  },
  studio: {
    bulkAcknowledgeChangeReview: (auditIds: string[]) =>
      req<BulkActionResult>('/studio/admin/change-review/bulk/acknowledge', {
        method: 'POST',
        body: JSON.stringify({ audit_ids: auditIds }),
      }),
    bulkUndoChangeReview: (auditIds: string[]) =>
      req<BulkActionResult>('/studio/admin/change-review/bulk/undo', {
        method: 'POST',
        body: JSON.stringify({ audit_ids: auditIds }),
      }),
  },
}
