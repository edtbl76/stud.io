'use client'

import { useRef, useState } from 'react'

export type BulkAction = 'approve' | 'reject'

const BULK_ENDPOINTS: Record<BulkAction, string> = {
  approve: 'bulk/acknowledge',
  reject: 'bulk/undo',
}

export interface UseChangeReviewBulkReturn {
  selectedIds: Set<string>
  bulkAction: BulkAction | null
  bulkError: boolean
  toggle: (id: string) => void
  shiftToggle: (id: string, allIds: string[]) => void
  selectAll: (ids: string[]) => void
  openBulkAction: (action: BulkAction) => void
  closeBulkAction: () => void
  confirmBulk: () => Promise<void>
}

export function useChangeReviewBulk(): UseChangeReviewBulkReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null)
  const [bulkError, setBulkError] = useState(false)
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

  async function confirmBulk() {
    const ids = Array.from(selectedIds)
    setBulkError(false)
    try {
      const res = await fetch(`/api/studio/admin/change-review/${BULK_ENDPOINTS[bulkAction!]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audit_ids: ids }),
      })
      if (!res.ok) throw new Error('Bulk action failed')
      closeBulkAction()
      clearSelection()
    } catch {
      setBulkError(true)
    }
  }

  return {
    selectedIds, bulkAction, bulkError,
    toggle, shiftToggle, selectAll,
    openBulkAction, closeBulkAction,
    confirmBulk,
  }
}
