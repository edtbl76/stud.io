'use client'

import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { LookupOut } from '@/lib/types'
import { RecordModal } from '@/components/RecordModal'
import { FieldRow } from '@/components/FieldRow'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface ConfigModalProps {
  record: LookupOut | null
  slug: string
  onClose: () => void
  onMutate: () => void
}

interface FormState {
  type_name: string
  type_description: string
}

function toForm(record: LookupOut | null): FormState {
  if (!record) return { type_name: '', type_description: '' }
  return {
    type_name: record.type_name ?? '',
    type_description: record.type_description ?? '',
  }
}

export function ConfigModal({ record, slug, onClose, onMutate }: ConfigModalProps) {
  const { role } = useAuth()
  const isCreate = record === null
  const endpoint = `/config/${slug}`
  const [isEditing, setIsEditing] = React.useState(isCreate)
  const [form, setForm] = React.useState<FormState>(() => toForm(record))
  const [error, setError] = React.useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {}
      if (form.type_name) body.type_name = form.type_name
      if (form.type_description) body.type_description = form.type_description

      if (!record) return api.create<LookupOut>(endpoint, body)
      return api.update<LookupOut>(endpoint, record.type_id, body)
    },
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(endpoint, record!.type_id),
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Delete failed'),
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  let title: string
  if (!record) {
    title = 'New Entry'
  } else if (isEditing) {
    title = `Edit: ${record.type_name}`
  } else {
    title = record.type_name
  }

  return (
    <RecordModal
      title={title}
      isAdmin={role === 'admin'}
      isEditing={isEditing}
      onEdit={() => setIsEditing(true)}
      onSave={() => { setError(null); saveMutation.mutate() }}
      onDelete={() => deleteMutation.mutate()}
      onClose={onClose}
      isSaving={saveMutation.isPending}
      isDeleting={deleteMutation.isPending}
    >
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
      )}

      {isEditing ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type_name">Name *</Label>
            <Input
              id="type_name"
              value={form.type_name}
              onChange={(e) => set('type_name', e.target.value)}
              placeholder="Name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type_description">Description</Label>
            <Textarea
              id="type_description"
              value={form.type_description}
              onChange={(e) => set('type_description', e.target.value)}
              rows={4}
              placeholder="Description..."
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <FieldRow label="Name" value={record?.type_name} />
          <FieldRow label="Description" value={record?.type_description} />
          <FieldRow label="ID" value={<code className="text-xs font-mono text-muted-foreground">{record?.type_id}</code>} />
        </div>
      )}
    </RecordModal>
  )
}
