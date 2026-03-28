import type { SearchResponse } from '@/lib/types'

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

export const api = {
  list:   <T>(ep: string, q?: string) => req<T[]>(q ? `${ep}?q=${encodeURIComponent(q)}` : ep),
  listPaged: <T>(ep: string, params: { limit?: number; offset?: number; sort_by?: string[]; sort_dir?: string[]; filters?: Record<string, string> }) => {
    const p = new URLSearchParams()
    if (params.limit !== undefined) p.set('limit', String(params.limit))
    if (params.offset !== undefined) p.set('offset', String(params.offset))
    params.sort_by?.forEach((k) => p.append('sort_by', k))
    params.sort_dir?.forEach((d) => p.append('sort_dir', d))
    if (params.filters) {
      for (const [key, val] of Object.entries(params.filters)) {
        if (val) p.set(`filter_${key}`, val)
      }
    }
    const qs = p.toString()
    return req<{ items: T[]; total: number }>(qs ? `${ep}?${qs}` : ep)
  },
  get:    <T>(ep: string, id: string) => req<T>(`${ep}/${id}`),
  create: <T>(ep: string, body: unknown) => req<T>(ep, { method: 'POST', body: JSON.stringify(body) }),
  update: <T>(ep: string, id: string, body: unknown) => req<T>(`${ep}/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (ep: string, id: string) => req<void>(`${ep}/${id}`, { method: 'DELETE' }),
  searchGlobal: (q: string, notes = false) =>
    req<SearchResponse>(`/search?q=${encodeURIComponent(q)}&notes=${notes}`),
}
