'use client'

import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Effect } from '@/lib/types'
import { RecordModal } from '@/components/RecordModal'
import { FieldRow } from '@/components/FieldRow'
import { TypeBadges } from '@/components/TypeBadges'
import { ParentLinks } from '@/components/ParentLinks'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/MultiSelect'

const ENDPOINT = '/session/effects'

interface EffectModalProps {
  record: Effect | null
  onClose: () => void
  onMutate: () => void
}

interface FormState {
  effect_name: string
  version: string
  collection: string
  effect_type_ids: string[]
  tool_type_ids: string[]
  plugin_format_ids: string[]
  tag_ids: string[]
  description: string
  workflow_notes: string
  recording_notes: string
  artist_reference: string
  attributes: string
}

function toForm(record: Effect | null): FormState {
  if (!record) {
    return {
      effect_name: '', version: '', collection: '',
      effect_type_ids: [], tool_type_ids: [], plugin_format_ids: [], tag_ids: [],
      description: '', workflow_notes: '', recording_notes: '', artist_reference: '',
      attributes: '',
    }
  }
  return {
    effect_name: record.effect_name ?? '',
    version: record.version ?? '',
    collection: record.collection ?? '',
    effect_type_ids: record.effect_type_ids ?? [],
    tool_type_ids: record.tool_type_ids ?? [],
    plugin_format_ids: record.plugin_format_ids ?? [],
    tag_ids: record.tag_ids ?? [],
    description: record.description ?? '',
    workflow_notes: record.workflow_notes ?? '',
    recording_notes: record.recording_notes ?? '',
    artist_reference: record.artist_reference ?? '',
    attributes: record.attributes ? JSON.stringify(record.attributes, null, 2) : '',
  }
}

export function EffectModal({ record, onClose, onMutate }: EffectModalProps) {
  const { role } = useAuth()
  const isCreate = record === null
  const [isEditing, setIsEditing] = React.useState(isCreate)
  const [form, setForm] = React.useState<FormState>(() => toForm(record))
  const [error, setError] = React.useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {}
      if (form.effect_name) body.effect_name = form.effect_name
      if (form.version) body.version = form.version
      if (form.collection) body.collection = form.collection
      if (form.effect_type_ids.length) body.effect_type_ids = form.effect_type_ids
      if (form.tool_type_ids.length) body.tool_type_ids = form.tool_type_ids
      if (form.plugin_format_ids.length) body.plugin_format_ids = form.plugin_format_ids
      if (form.tag_ids.length) body.tag_ids = form.tag_ids
      if (form.description) body.description = form.description
      if (form.workflow_notes) body.workflow_notes = form.workflow_notes
      if (form.recording_notes) body.recording_notes = form.recording_notes
      if (form.artist_reference) body.artist_reference = form.artist_reference
      if (form.attributes) { try { body.attributes = JSON.parse(form.attributes) } catch {} }

      if (!record) return api.create<Effect>(ENDPOINT, body)
      return api.update<Effect>(ENDPOINT, record.effect_id, body)
    },
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(ENDPOINT, record!.effect_id),
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Delete failed'),
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  let title: string
  if (!record) {
    title = 'New Effect'
  } else if (isEditing) {
    title = `Edit: ${record.full_effect_name}`
  } else {
    title = record.full_effect_name
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
            <Label htmlFor="effect_name">Effect Name *</Label>
            <Input id="effect_name" value={form.effect_name} onChange={(e) => set('effect_name', e.target.value)} placeholder="Effect Name" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="version">Version</Label>
            <Input id="version" value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="Version" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="collection">Collection</Label>
            <Input id="collection" value={form.collection} onChange={(e) => set('collection', e.target.value)} placeholder="Collection" />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Effect Types</Label>
            <MultiSelect configSlug="effect-types" value={form.effect_type_ids} onChange={(v) => set('effect_type_ids', v)} placeholder="Select effect types..." />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Tool Types</Label>
            <MultiSelect configSlug="tool-types" value={form.tool_type_ids} onChange={(v) => set('tool_type_ids', v)} placeholder="Select tool types..." />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Plugin Formats</Label>
            <MultiSelect configSlug="plugin-formats" value={form.plugin_format_ids} onChange={(v) => set('plugin_format_ids', v)} placeholder="Select formats..." />
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
            <Label htmlFor="workflow_notes">Workflow Notes</Label>
            <Textarea id="workflow_notes" value={form.workflow_notes} onChange={(e) => set('workflow_notes', e.target.value)} rows={3} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="recording_notes">Recording Notes</Label>
            <Textarea id="recording_notes" value={form.recording_notes} onChange={(e) => set('recording_notes', e.target.value)} rows={3} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="artist_reference">Artist Reference</Label>
            <Textarea id="artist_reference" value={form.artist_reference} onChange={(e) => set('artist_reference', e.target.value)} rows={2} />
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
          <FieldRow label="Effect Name" value={record?.effect_name} />
          <FieldRow label="Brand" value={record?.brand_name} />
          <FieldRow label="Version" value={record?.version} />
          <FieldRow label="Collection" value={record?.collection} />
          <div className="col-span-2"><FieldRow label="Effect Types" value={<TypeBadges types={record?.effect_types} />} /></div>
          <div className="col-span-2"><FieldRow label="Tool Types" value={<TypeBadges types={record?.tool_types} />} /></div>
          <div className="col-span-2"><FieldRow label="Plugin Formats" value={<TypeBadges types={record?.plugin_formats} />} /></div>
          <div className="col-span-2"><FieldRow label="Tags" value={<TypeBadges types={record?.tags} />} /></div>
          <div className="col-span-2"><FieldRow label="Parents" value={<ParentLinks parents={record?.parents} />} /></div>
          <div className="col-span-2"><FieldRow label="Description" value={record?.description} /></div>
          <div className="col-span-2"><FieldRow label="Workflow Notes" value={record?.workflow_notes} /></div>
          <div className="col-span-2"><FieldRow label="Recording Notes" value={record?.recording_notes} /></div>
          <div className="col-span-2"><FieldRow label="Artist Reference" value={record?.artist_reference} /></div>
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
