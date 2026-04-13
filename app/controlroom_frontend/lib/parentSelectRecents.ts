import type { ParentRef } from '@/lib/types'

const RECENTS_KEY = 'parentSelect_recents'
const MAX_RECENTS = 10

export function loadRecents(): ParentRef[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const valid = parsed.filter(
      (item): item is ParentRef =>
        typeof item === 'object' && item !== null &&
        typeof (item as Record<string, unknown>).table_name === 'string' &&
        typeof (item as Record<string, unknown>).id === 'string'
    )
    return valid
  } catch {
    return []
  }
}

export function pushRecent(ref: ParentRef): void {
  const current = loadRecents()
  const deduped = [ref, ...current.filter(r => !(r.table_name === ref.table_name && r.id === ref.id))]
  localStorage.setItem(RECENTS_KEY, JSON.stringify(deduped.slice(0, MAX_RECENTS)))
}
