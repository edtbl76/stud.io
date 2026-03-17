'use client'

import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Model } from '@/lib/types'
import { RecordModal } from '@/components/RecordModal'
import { FieldRow } from '@/components/FieldRow'
import { TypeBadges } from '@/components/TypeBadges'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/MultiSelect'

const ENDPOINT = '/catalog/models'

interface ModelModalProps {
  record: Model | null
  onClose: () => void
  onMutate: () => void
}

interface FormState {
  model_name: string
  model_type_ids: string[]
  creator: string
  years_active: string
  links: string
  description: string
  recording_notes: string
  artist_reference: string
  attributes: string
}

function toForm(record: Model | null): FormState {
  if (!record) {
    return {
      model_name: '',
      model_type_ids: [],
      creator: '',
      years_active: '',
      links: '',
      description: '',
      recording_notes: '',
      artist_reference: '',
      attributes: '',
    }
  }
  return {
    model_name: record.model_name ?? '',
    model_type_ids: record.model_type_ids ?? [],
    creator: record.creator ?? '',
    years_active: record.years_active ?? '',
    links: record.links ?? '',
    description: record.description ?? '',
    recording_notes: record.recording_notes ?? '',
    artist_reference: record.artist_reference ?? '',
    attributes: record.attributes ? JSON.stringify(record.attributes, null, 2) : '',
  }
}

export function ModelModal({ record, onClose, onMutate }: ModelModalProps) {
  const { role } = useAuth()
  const isCreate = record === null
  const [isEditing, setIsEditing] = React.useState(isCreate)
  const [form, setForm] = React.useState<FormState>(() => toForm(record))
  const [error, setError] = React.useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {}
      if (form.model_name) body.model_name = form.model_name
      if (form.model_type_ids.length > 0) body.model_type_ids = form.model_type_ids
      if (form.creator) body.creator = form.creator
      if (form.years_active) body.years_active = form.years_active
      if (form.links) body.links = form.links
      if (form.description) body.description = form.description
      if (form.recording_notes) body.recording_notes = form.recording_notes
      if (form.artist_reference) body.artist_reference = form.artist_reference
      if (form.attributes) {
        try { body.attributes = JSON.parse(form.attributes) } catch {}
      }

      if (record) {
        return api.update<Model>(ENDPOINT, record.model_id, body)
      } else {
        return api.create<Model>(ENDPOINT, body)
      }
    },
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(ENDPOINT, record!.model_id),
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Delete failed'),
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  let title: string
  if (!record) {
    title = 'New Model'
  } else if (isEditing) {
    title = `Edit: ${record.full_model_name}`
  } else {
    title = record.full_model_name
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
            <Label htmlFor="model_name">Model Name *</Label>
            <Input
              id="model_name"
              value={form.model_name}
              onChange={(e) => set('model_name', e.target.value)}
              placeholder="Model Name"
            />
          </div>

          {!isCreate && record?.brand_name && (
            <div className="col-span-2">
              <FieldRow label="Brand" value={record.brand_name} />
            </div>
          )}

          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Model Types</Label>
            <MultiSelect
              configSlug="model-types"
              value={form.model_type_ids}
              onChange={(v) => set('model_type_ids', v)}
              placeholder="Select model types..."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="creator">Creator</Label>
            <Input
              id="creator"
              value={form.creator}
              onChange={(e) => set('creator', e.target.value)}
              placeholder="Creator"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="years_active">Years Active</Label>
            <Input
              id="years_active"
              value={form.years_active}
              onChange={(e) => set('years_active', e.target.value)}
              placeholder="e.g. 1990–2000"
            />
          </div>

          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="links">Links</Label>
            <Input
              id="links"
              value={form.links}
              onChange={(e) => set('links', e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
            />
          </div>

          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="recording_notes">Recording Notes</Label>
            <Textarea
              id="recording_notes"
              value={form.recording_notes}
              onChange={(e) => set('recording_notes', e.target.value)}
              rows={3}
            />
          </div>

          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="artist_reference">Artist Reference</Label>
            <Textarea
              id="artist_reference"
              value={form.artist_reference}
              onChange={(e) => set('artist_reference', e.target.value)}
              rows={2}
            />
          </div>

          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="attributes">Attributes (JSON)</Label>
            <Textarea
              id="attributes"
              value={form.attributes}
              onChange={(e) => set('attributes', e.target.value)}
              rows={4}
              className="font-mono text-xs"
              placeholder="{}"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="Model Name" value={record?.model_name} />
          <FieldRow label="Brand" value={record?.brand_name} />
          <div className="col-span-2">
            <FieldRow label="Types" value={<TypeBadges types={record?.model_types} />} />
          </div>
          <FieldRow label="Creator" value={record?.creator} />
          <FieldRow label="Years Active" value={record?.years_active} />
          <div className="col-span-2">
            <FieldRow label="Links" value={record?.links} />
          </div>
          <div className="col-span-2">
            <FieldRow label="Description" value={record?.description} />
          </div>
          <div className="col-span-2">
            <FieldRow label="Recording Notes" value={record?.recording_notes} />
          </div>
          <div className="col-span-2">
            <FieldRow label="Artist Reference" value={record?.artist_reference} />
          </div>
          {record?.attributes && (
            <div className="col-span-2">
              <FieldRow
                label="Attributes"
                value={
                  <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-40 font-mono">
                    {JSON.stringify(record.attributes, null, 2)}
                  </pre>
                }
              />
            </div>
          )}
          <FieldRow label="Created" value={record?.created_at ? new Date(record.created_at).toLocaleString() : null} />
          <FieldRow label="Updated" value={record?.updated_at ? new Date(record.updated_at).toLocaleString() : null} />
        </div>
      )}
    </RecordModal>
  )
}
