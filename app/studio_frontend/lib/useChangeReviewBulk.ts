'use client'

import { useRef, useState } from 'react'

export type BulkAction = 'approve' | 'reject'

export interface UseChangeReviewBulkReturn {
  selectedIds: Set<string>
  bulkAction: BulkAction | null
  toggle: (id: string) => void
  shiftToggle: (id: string, allIds: string[]) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void
  openBulkAction: (action: BulkAction) => void
  closeBulkAction: () => void
}

export function useChangeReviewBulk(): UseChangeReviewBulkReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null)
  const lastSelectedRef = useRef<string | null>(null)

  function toggle(id: string) {
    lastSelectedRef.current = id
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function shiftToggle(id: string, allIds: string[]) {
    const last = lastSelectedRef.current
    lastSelectedRef.current = id
    if (!last) {
      toggle(id)
      return
    }
    const fromIdx = allIds.indexOf(last)
    const toIdx = allIds.indexOf(id)
    if (fromIdx === -1 || toIdx === -1) {
      toggle(id)
      return
    }
    const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
    const range = allIds.slice(start, end + 1)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      range.forEach((rid) => next.add(rid))
      return next
    })
  }

  function selectAll(ids: string[]) {
    setSelectedIds(new Set(ids))
  }

  function clearSelection() {
    setSelectedIds(new Set())
    lastSelectedRef.current = null
  }

  function openBulkAction(action: BulkAction) {
    setBulkAction(action)
  }

  function closeBulkAction() {
    setBulkAction(null)
  }

  return { selectedIds, bulkAction, toggle, shiftToggle, selectAll, clearSelection, openBulkAction, closeBulkAction }
}
