'use client'

import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Library } from '@/lib/types'
import { RecordModal } from '@/components/RecordModal'
import { FieldRow } from '@/components/FieldRow'
import { TypeBadges } from '@/components/TypeBadges'
import { ParentLinks } from '@/components/ParentLinks'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/MultiSelect'

const ENDPOINT = '/session/libraries'

interface LibraryModalProps {
  record: Library | null
  onClose: () => void
  onMutate: () => void
}

interface FormState {
  library_name: string
  tag_ids: string[]
  description: string
  instrument_notes: string
  recording_notes: string
  attributes: string
}

function toForm(record: Library | null): FormState {
  if (!record) {
    return {
      library_name: '', tag_ids: [],
      description: '', instrument_notes: '', recording_notes: '', attributes: '',
    }
  }
  return {
    library_name: record.library_name ?? '',
    tag_ids: record.tag_ids ?? [],
    description: record.description ?? '',
    instrument_notes: record.instrument_notes ?? '',
    recording_notes: record.recording_notes ?? '',
    attributes: record.attributes ? JSON.stringify(record.attributes, null, 2) : '',
  }
}

export function LibraryModal({ record, onClose, onMutate }: LibraryModalProps) {
  const { role } = useAuth()
  const isCreate = record === null
  const [isEditing, setIsEditing] = React.useState(isCreate)
  const [form, setForm] = React.useState<FormState>(() => toForm(record))
  const [error, setError] = React.useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {}
      if (form.library_name) body.library_name = form.library_name
      if (form.tag_ids.length) body.tag_ids = form.tag_ids
      if (form.description) body.description = form.description
      if (form.instrument_notes) body.instrument_notes = form.instrument_notes
      if (form.recording_notes) body.recording_notes = form.recording_notes
      if (form.attributes) { try { body.attributes = JSON.parse(form.attributes) } catch {} }

      if (isCreate) return api.create<Library>(ENDPOINT, body)
      return api.update<Library>(ENDPOINT, record!.library_id, body)
    },
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(ENDPOINT, record!.library_id),
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Delete failed'),
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  let title: string
  if (isCreate) {
    title = 'New Library'
  } else if (isEditing) {
    title = `Edit: ${record!.full_library_name}`
  } else {
    title = record!.full_library_name
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
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="library_name">Library Name *</Label>
            <Input id="library_name" value={form.library_name} onChange={(e) => set('library_name', e.target.value)} placeholder="Library Name" />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Tags</Label>
            <MultiSelect configSlug="tag-types" value={form.tag_ids} onChange={(v) => set('tag_ids', v)} placeholder="Select tags..." />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="instrument_notes">Instrument Notes</Label>
            <Textarea id="instrument_notes" value={form.instrument_notes} onChange={(e) => set('instrument_notes', e.target.value)} rows={3} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="recording_notes">Recording Notes</Label>
            <Textarea id="recording_notes" value={form.recording_notes} onChange={(e) => set('recording_notes', e.target.value)} rows={3} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="attributes">Attributes (JSON)</Label>
            <Textarea id="attributes" value={form.attributes} onChange={(e) => set('attributes', e.target.value)} rows={4} className="font-mono text-xs" placeholder="{}" />
          </div>
          {!isCreate && (
            <div className="col-span-2">
              <FieldRow label="Parents (read-only)" value={<ParentLinks parents={record?.parents} />} />
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="Library Name" value={record?.library_name} />
          <FieldRow label="Brand" value={record?.brand_name} />
          <div className="col-span-2"><FieldRow label="Tags" value={<TypeBadges types={record?.tags} />} /></div>
          <div className="col-span-2"><FieldRow label="Parents" value={<ParentLinks parents={record?.parents} />} /></div>
          <div className="col-span-2"><FieldRow label="Description" value={record?.description} /></div>
          <div className="col-span-2"><FieldRow label="Instrument Notes" value={record?.instrument_notes} /></div>
          <div className="col-span-2"><FieldRow label="Recording Notes" value={record?.recording_notes} /></div>
          {record?.attributes && (
            <div className="col-span-2">
              <FieldRow label="Attributes" value={
                <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-40 font-mono">
                  {JSON.stringify(record.attributes, null, 2)}
                </pre>
              } />
            </div>
          )}
          <FieldRow label="Created" value={record?.created_at ? new Date(record.created_at).toLocaleString() : null} />
          <FieldRow label="Updated" value={record?.updated_at ? new Date(record.updated_at).toLocaleString() : null} />
        </div>
      )}
    </RecordModal>
  )
}
