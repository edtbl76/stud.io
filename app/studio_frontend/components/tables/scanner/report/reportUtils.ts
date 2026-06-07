import type { ScanListItem } from '@/lib/types'

export const CANONICAL_STATUS_ORDER = [
  'known',
  'unlinked',
  'orphaned',
  'needs_review',
  'excluded',
]

export function formatPickerLabel(scan: ScanListItem): string {
  const d = new Date(scan.scanned_at)
  const date = d.toLocaleDateString('en-CA')
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const unit = scan.total_count === 1 ? 'result' : 'results'
  return `${date} ${time} · ${scan.source_machine} (${scan.total_count} ${unit})`
}

const STATUS_LABELS: Record<string, string> = {
  known:        'Known',
  unlinked:     'Unlinked',
  orphaned:     'Orphaned',
  needs_review: 'Needs Review',
  excluded:     'Excluded',
}

export function formatStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? (status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' '))
}

export function sortedStatusKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ai = CANONICAL_STATUS_ORDER.indexOf(a)
    const bi = CANONICAL_STATUS_ORDER.indexOf(b)
    const aOrder = ai === -1 ? Infinity : ai
    const bOrder = bi === -1 ? Infinity : bi
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.localeCompare(b)
  })
}
