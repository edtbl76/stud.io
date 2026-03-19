const EXCLUDED = new Set(['updated_at', 'created_at'])

export function computeDiff(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
): Array<{ field: string; from: unknown; to: unknown }> {
  const allKeys = new Set(Object.keys(oldData).concat(Object.keys(newData)))
  return Array.from(allKeys)
    .filter((k) => !EXCLUDED.has(k))
    .filter((k) => JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
    .map((k) => ({ field: k, from: oldData[k], to: newData[k] }))
}

const UUID_RE = /^[0-9a-f-]{36}$/i

export function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  const s = typeof value === 'string' ? value : JSON.stringify(value)
  if (UUID_RE.test(s)) return s.slice(0, 8)
  return s
}
