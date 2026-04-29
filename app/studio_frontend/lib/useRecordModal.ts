'use client'

import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export type ModalMode = 'view' | 'edit' | 'history'

// Props that every <RecordModal> caller passes identically — returned as a
// spread-ready object so each modal replaces 11 repeated prop lines with one.
export interface RecordModalSharedProps {
  title: string
  isAdmin: boolean
  isEditing: boolean
  isHistory: boolean
  onEdit: () => void
  onHistory: (() => void) | undefined
  onSave: () => void
  onDelete: () => void
  onClose: () => void
  isSaving: boolean
  isDeleting: boolean
}

interface UseRecordModalOptions<TRecord, TForm> {
  record: TRecord | null
  endpoint: string
  getRecordId: (record: TRecord) => string
  getHistoryUrl?: (record: TRecord) => string
  getTitle: (mode: ModalMode, record: TRecord | null) => string
  toForm: (record: TRecord | null) => TForm
  buildPayload: (form: TForm) => Record<string, unknown>
  onClose: () => void
  onMutate: () => void
}

export interface UseRecordModalResult<TForm> {
  mode: ModalMode
  form: TForm
  set: <K extends keyof TForm>(key: K, value: TForm[K]) => void
  error: string | null
  isCreate: boolean
  isAdmin: boolean
  historyUrl: string
  recordModalProps: RecordModalSharedProps
}

function toErrMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function useRecordModal<TRecord, TForm>({
  record,
  endpoint,
  getRecordId,
  getHistoryUrl,
  getTitle,
  toForm,
  buildPayload,
  onClose,
  onMutate,
}: UseRecordModalOptions<TRecord, TForm>): UseRecordModalResult<TForm> {
  const { role } = useAuth()
  const isCreate = record === null
  const isAdmin = role === 'admin'
  const hasHistory = !!(record && getHistoryUrl)
  const [mode, setMode] = React.useState<ModalMode>(isCreate ? 'edit' : 'view')
  const [form, setForm] = React.useState<TForm>(() => toForm(record))
  const [error, setError] = React.useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = buildPayload(form)
      if (!record) return api.create<TRecord>(endpoint, body)
      return api.update<TRecord>(endpoint, getRecordId(record), body)
    },
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(toErrMsg(err, 'Save failed')),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(endpoint, getRecordId(record!)),
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(toErrMsg(err, 'Delete failed')),
  })

  function set<K extends keyof TForm>(key: K, value: TForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const recordModalProps: RecordModalSharedProps = {
    title: getTitle(mode, record),
    isAdmin,
    isEditing: mode === 'edit',
    isHistory: mode === 'history',
    onEdit: () => setMode('edit'),
    onHistory: hasHistory ? () => setMode('history') : undefined,
    onSave: () => { setError(null); saveMutation.mutate() },
    onDelete: () => deleteMutation.mutate(),
    onClose,
    isSaving: saveMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }

  return {
    mode,
    form,
    set,
    error,
    isCreate,
    isAdmin,
    historyUrl: (record && getHistoryUrl) ? getHistoryUrl(record) : '',
    recordModalProps,
  }
}
