import type { ParentRef } from '@/lib/types'

const RECENTS_KEY = 'parentSelect_recents'
const MAX_RECENTS = 10

export function loadRecents(): ParentRef[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as ParentRef[]
  } catch {
    return []
  }
}

export function pushRecent(ref: ParentRef): void {
  const current = loadRecents()
  const deduped = [ref, ...current.filter(r => !(r.table_name === ref.table_name && r.id === ref.id))]
  localStorage.setItem(RECENTS_KEY, JSON.stringify(deduped.slice(0, MAX_RECENTS)))
}
