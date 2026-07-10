import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { OrphanedRecord, WorkbenchRow } from '@/lib/types'

type Mode = 'unlinked-to-orphaned' | 'orphaned-to-unlinked'

function modeToType(mode: Mode): 'unlinked' | 'orphaned' {
  return mode === 'unlinked-to-orphaned' ? 'unlinked' : 'orphaned'
}

function candidateId(candidate: WorkbenchRow | OrphanedRecord, mode: Mode): string {
  return mode === 'unlinked-to-orphaned'
    ? (candidate as OrphanedRecord).catalog_record_id
    : (candidate as WorkbenchRow).result_id
}

export function useFindLink(mode: Mode, sourceId: string) {
  const [query, setQueryRaw] = React.useState('')
  const [debouncedQuery, setDebouncedQuery] = React.useState('')
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [createRules, setCreateRules] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const type = modeToType(mode)

  const { data, isLoading } = useQuery({
    queryKey: ['scanner', 'links', 'candidates', mode, sourceId, debouncedQuery],
    queryFn: () => api.scanner.findLinkCandidates(type, sourceId, debouncedQuery),
  })

  const candidates = (data?.candidates ?? []) as (WorkbenchRow | OrphanedRecord)[]

  function setQuery(q: string) {
    setQueryRaw(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setDebouncedQuery(q) }, 300)
  }

  function toggleCandidate(id: string) {
    if (mode === 'unlinked-to-orphaned') {
      setSelectedIds(new Set([id]))
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }
  }

  async function confirmLink() {
    if (selectedIds.size === 0) return
    setIsSubmitting(true)
    try {
      if (mode === 'unlinked-to-orphaned') {
        const [selectedId] = selectedIds
        const candidate = candidates.find(
          (c) => candidateId(c, mode) === selectedId
        ) as OrphanedRecord | undefined
        if (!candidate) return
        await api.scanner.createLink({
          result_id: sourceId,
          catalog_record_id: candidate.catalog_record_id,
          catalog_record_table: candidate.catalog_record_table,
          create_rules: createRules,
        })
      } else {
        const candidate = candidates.find(
          (c) => candidateId(c, mode) === [...selectedIds][0]
        ) as WorkbenchRow | undefined
        if (!candidate) return
        await api.scanner.bulkCreateLinks({
          result_ids: [...selectedIds],
          catalog_record_id: sourceId,
          catalog_record_table: candidate.catalog_record_table ?? '',
          create_rules: createRules,
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    candidates,
    isLoading,
    query,
    setQuery,
    selectedIds,
    toggleCandidate,
    createRules,
    setCreateRules,
    confirmLink,
    isSubmitting,
  }
}
