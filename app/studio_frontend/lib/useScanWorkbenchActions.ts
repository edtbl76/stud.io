'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { buildRequest, type ConfirmationRequest } from '@/lib/bulkConfirmation'
import type { NeedsReviewSubState, WorkbenchRow } from '@/lib/types'

export type ActiveModal =
  | { type: 'single-resolution'; row: WorkbenchRow; readOnly: boolean }
  | { type: 'collision'; row: WorkbenchRow }
  | { type: 'find-link-unlinked'; sourceId: string }
  | { type: 'find-link-orphaned'; sourceId: string }
  | { type: 'create-record'; row: WorkbenchRow }
  | null

interface Input {
  rows: WorkbenchRow[]
  selectedIds: Set<string>
  rowSubStates: Map<string, NeedsReviewSubState>
  invalidate: () => void
  clearSelection: () => void
}

export function useScanWorkbenchActions({ rows, selectedIds, rowSubStates, invalidate, clearSelection }: Input) {
  const [hardResetOpen, setHardResetOpen] = useState(false)
  const [hardResetText, setHardResetText] = useState('')
  const [hardResetSubmitting, setHardResetSubmitting] = useState(false)
  const [bulkResolveQueue, setBulkResolveQueue] = useState<WorkbenchRow[]>([])
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmationRequest | null>(null)

  const selectedRows = rows.filter((r) => selectedIds.has(r.result_id))
  const currentModalRow = bulkResolveQueue[0] ?? null

  async function handleSoftReset() {
    try {
      await api.scanner.softReset()
      toast.success('Soft reset complete')
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Soft reset failed. Please try again.')
    }
  }

  async function handleHardReset() {
    if (hardResetSubmitting) return
    setHardResetSubmitting(true)
    try {
      await api.scanner.hardReset(hardResetText)
      toast.success('Hard reset complete')
      setHardResetOpen(false)
      setHardResetText('')
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hard reset failed. Please try again.')
    } finally {
      setHardResetSubmitting(false)
    }
  }

  function handleHardResetCancel() {
    setHardResetOpen(false)
    setHardResetText('')
  }

  function handleBulkResolve() {
    setBulkResolveQueue(selectedRows.filter((r) => r.bucket === 'needs_review'))
  }

  function handleModalSaved() {
    invalidate()
    setBulkResolveQueue((prev) => prev.slice(1))
  }

  async function handleReject(row: WorkbenchRow) {
    try {
      await api.scanner.rejectMatch(row.result_id)
      toast.success('Match rejected')
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed. Please try again.')
    }
  }

  function handleFindLink(row: WorkbenchRow) {
    setActiveModal({ type: 'find-link-unlinked', sourceId: row.result_id })
  }

  function handleOrphanRowFindLink(row: WorkbenchRow) {
    if (row.catalog_record_id == null) return
    setActiveModal({ type: 'find-link-orphaned', sourceId: row.catalog_record_id })
  }

  function handleCreateRecord(row: WorkbenchRow) {
    setActiveModal({ type: 'create-record', row })
  }

  async function handleExclude(row: WorkbenchRow) {
    try {
      await api.scanner.exclude(row.disk_vendor, row.disk_name, row.disk_format)
      toast.success('Entry excluded')
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Exclude failed. Please try again.')
    }
  }

  function handleResolveCollision(row: WorkbenchRow) {
    setActiveModal({ type: 'collision', row })
  }

  const rowClickHandlers: Partial<Record<WorkbenchRow['bucket'], (row: WorkbenchRow) => void>> = {
    needs_review: (row) => setActiveModal({ type: 'single-resolution', row, readOnly: false }),
    known: (row) => setActiveModal({ type: 'single-resolution', row, readOnly: true }),
    collision: handleResolveCollision,
    unlinked: handleFindLink,
    orphaned: handleOrphanRowFindLink,
  }

  function handleRowClick(row: WorkbenchRow) {
    rowClickHandlers[row.bucket]?.(row)
  }

  async function handleBulkReject() {
    const queue = selectedRows.filter((r) => r.bucket === 'needs_review' || r.bucket === 'known')
    let completed = 0
    try {
      for (const row of queue) {
        await api.scanner.rejectMatch(row.result_id)
        completed++
      }
      toast.success(`${completed} matches rejected`)
    } catch (err) {
      toast.error(err instanceof Error ? `${completed} of ${queue.length} rejected — stopped on error` : 'Bulk reject failed.')
    } finally {
      clearSelection()
      invalidate()
    }
  }

  async function handleBulkUpdate() {
    const qualifying = selectedRows.filter((r) => rowSubStates.get(r.result_id) === 'mismatch')
    try {
      const result = await api.scanner.bulkUpdate(qualifying.map((r) => r.result_id))
      toast.success(`${result.updated} record(s) updated`)
      clearSelection()
      invalidate()
    } catch {
      toast.error('Bulk update failed. Please try again.')
    }
  }

  async function handleBulkExclude() {
    const results = await Promise.allSettled(
      selectedRows.map((r) => api.scanner.exclude(r.disk_vendor, r.disk_name, r.disk_format))
    )
    clearSelection()
    invalidate()
    const failed = results
      .map((res, i) => ({ res, row: selectedRows[i] }))
      .filter(({ res }) => res.status === 'rejected')
    if (failed.length > 0) {
      const names = failed.map(({ row }) => row.disk_name).join(', ')
      toast.error(`Failed to exclude: ${names}`)
    }
  }

  // U-20: the bulk-confirmation gate. Each request* opens the gate; confirmPending
  // runs the existing handler unchanged (Q5=A). Bulk Resolve stays exempt.
  function requestBulkExclude() { setPendingConfirm(buildRequest('exclude', selectedRows, rowSubStates)) }
  function requestBulkReject() { setPendingConfirm(buildRequest('reject', selectedRows, rowSubStates)) }
  function requestBulkUpdate() { setPendingConfirm(buildRequest('bulk-update', selectedRows, rowSubStates)) }
  function cancelConfirm() { setPendingConfirm(null) }

  async function confirmPending() {
    const kind = pendingConfirm?.kind
    setPendingConfirm(null)
    if (kind === 'exclude') await handleBulkExclude()
    else if (kind === 'reject') await handleBulkReject()
    else if (kind === 'bulk-update') await handleBulkUpdate()
  }

  return {
    selectedRows,
    currentModalRow,
    activeModal, setActiveModal,
    hardResetOpen, setHardResetOpen,
    hardResetText, setHardResetText,
    hardResetSubmitting,
    bulkResolveQueue, setBulkResolveQueue,
    handleSoftReset, handleHardReset, handleHardResetCancel,
    handleBulkResolve, handleModalSaved,
    handleReject, handleFindLink, handleOrphanRowFindLink,
    handleRowClick,
    handleCreateRecord, handleExclude,
    handleResolveCollision, handleBulkReject, handleBulkUpdate, handleBulkExclude,
    pendingConfirm, requestBulkExclude, requestBulkReject, requestBulkUpdate,
    confirmPending, cancelConfirm,
  }
}
