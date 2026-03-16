'use client'

import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Instrument } from '@/lib/types'
import { RecordModal } from '@/components/RecordModal'
import { FieldRow } from '@/components/FieldRow'
import { TypeBadges } from '@/components/TypeBadges'
import { ParentLinks } from '@/components/ParentLinks'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/MultiSelect'

const ENDPOINT = '/session/instruments'

interface InstrumentModalProps {
  record: Instrument | null
  onClose: () => void
  onMutate: () => void
}

interface FormState {
  instrument_name: string
  version: string
  instrument_type_ids: string[]
  tool_type_ids: string[]
  plugin_format_ids: string[]
  tag_ids: string[]
  description: string
  instrument_notes: string
  recording_notes: string
  attributes: string
}

function toForm(record: Instrument | null): FormState {
  if (!record) {
    return {
      instrument_name: '', version: '',
      instrument_type_ids: [], tool_type_ids: [], plugin_format_ids: [], tag_ids: [],
      description: '', instrument_notes: '', recording_notes: '', attributes: '',
    }
  }
  return {
    instrument_name: record.instrument_name ?? '',
    version: record.version ?? '',
    instrument_type_ids: record.instrument_type_ids ?? [],
    tool_type_ids: record.tool_type_ids ?? [],
    plugin_format_ids: record.plugin_format_ids ?? [],
    tag_ids: record.tag_ids ?? [],
    description: record.description ?? '',
    instrument_notes: record.instrument_notes ?? '',
    recording_notes: record.recording_notes ?? '',
    attributes: record.attributes ? JSON.stringify(record.attributes, null, 2) : '',
  }
}

export function InstrumentModal({ record, onClose, onMutate }: InstrumentModalProps) {
  const { role } = useAuth()
  const isCreate = record === null
  const [isEditing, setIsEditing] = React.useState(isCreate)
  const [form, setForm] = React.useState<FormState>(() => toForm(record))
  const [error, setError] = React.useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {}
      if (form.instrument_name) body.instrument_name = form.instrument_name
      if (form.version) body.version = form.version
      if (form.instrument_type_ids.length) body.instrument_type_ids = form.instrument_type_ids
      if (form.tool_type_ids.length) body.tool_type_ids = form.tool_type_ids
      if (form.plugin_format_ids.length) body.plugin_format_ids = form.plugin_format_ids
      if (form.tag_ids.length) body.tag_ids = form.tag_ids
      if (form.description) body.description = form.description
      if (form.instrument_notes) body.instrument_notes = form.instrument_notes
      if (form.recording_notes) body.recording_notes = form.recording_notes
      if (form.attributes) { try { body.attributes = JSON.parse(form.attributes) } catch {} }

      if (isCreate) return api.create<Instrument>(ENDPOINT, body)
      return api.update<Instrument>(ENDPOINT, record!.instrument_id, body)
    },
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(ENDPOINT, record!.instrument_id),
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Delete failed'),
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  let title: string
  if (isCreate) {
    title = 'New Instrument'
  } else if (isEditing) {
    title = `Edit: ${record!.full_instrument_name}`
  } else {
    title = record!.full_instrument_name
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
            <Label htmlFor="instrument_name">Instrument Name *</Label>
            <Input id="instrument_name" value={form.instrument_name} onChange={(e) => set('instrument_name', e.target.value)} placeholder="Instrument Name" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="version">Version</Label>
            <Input id="version" value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="Version" />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Instrument Types</Label>
            <MultiSelect configSlug="instrument-types" value={form.instrument_type_ids} onChange={(v) => set('instrument_type_ids', v)} placeholder="Select instrument types..." />
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
          <FieldRow label="Instrument Name" value={record?.instrument_name} />
          <FieldRow label="Brand" value={record?.brand_name} />
          <FieldRow label="Version" value={record?.version} />
          <div className="col-span-2"><FieldRow label="Instrument Types" value={<TypeBadges types={record?.instrument_types} />} /></div>
          <div className="col-span-2"><FieldRow label="Tool Types" value={<TypeBadges types={record?.tool_types} />} /></div>
          <div className="col-span-2"><FieldRow label="Plugin Formats" value={<TypeBadges types={record?.plugin_formats} />} /></div>
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
