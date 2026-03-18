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
  get:    <T>(ep: string, id: string) => req<T>(`${ep}/${id}`),
  create: <T>(ep: string, body: unknown) => req<T>(ep, { method: 'POST', body: JSON.stringify(body) }),
  update: <T>(ep: string, id: string, body: unknown) => req<T>(`${ep}/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (ep: string, id: string) => req<void>(`${ep}/${id}`, { method: 'DELETE' }),
}
