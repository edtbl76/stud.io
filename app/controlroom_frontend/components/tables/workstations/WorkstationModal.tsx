'use client'

import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Workstation } from '@/lib/types'
import { RecordModal } from '@/components/RecordModal'
import { FieldRow } from '@/components/FieldRow'
import { TypeBadges } from '@/components/TypeBadges'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { BrandSelect } from '@/components/ui/BrandSelect'

const ENDPOINT = '/workstations'

interface WorkstationModalProps {
  record: Workstation | null
  onClose: () => void
  onMutate: () => void
}

interface FormState {
  tool_name: string
  brand_id: string
  brand_name: string
  version: string
  tool_type_ids: string[]
  plugin_format_ids: string[]
  tag_ids: string[]
  description: string
  workflow_notes: string
}

function toForm(record: Workstation | null): FormState {
  if (!record) {
    return {
      tool_name: '', brand_id: '', brand_name: '', version: '',
      tool_type_ids: [], plugin_format_ids: [], tag_ids: [],
      description: '', workflow_notes: '',
    }
  }
  return {
    tool_name: record.tool_name ?? '',
    brand_id: record.brand_id ?? '',
    brand_name: record.brand_name ?? '',
    version: record.version ?? '',
    tool_type_ids: record.tool_type_ids ?? [],
    plugin_format_ids: record.plugin_format_ids ?? [],
    tag_ids: record.tag_ids ?? [],
    description: record.description ?? '',
    workflow_notes: record.workflow_notes ?? '',
  }
}

export function WorkstationModal({ record, onClose, onMutate }: Readonly<WorkstationModalProps>) {
  const { role } = useAuth()
  const isCreate = record === null
  const [isEditing, setIsEditing] = React.useState(isCreate)
  const [form, setForm] = React.useState<FormState>(() => toForm(record))
  const [error, setError] = React.useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {}
      if (form.tool_name) body.tool_name = form.tool_name
      if (form.brand_id) body.brand_id = form.brand_id
      if (form.version) body.version = form.version
      if (form.tool_type_ids.length) body.tool_type_ids = form.tool_type_ids
      if (form.plugin_format_ids.length) body.plugin_format_ids = form.plugin_format_ids
      if (form.tag_ids.length) body.tag_ids = form.tag_ids
      if (form.description) body.description = form.description
      if (form.workflow_notes) body.workflow_notes = form.workflow_notes

      if (!record) return api.create<Workstation>(ENDPOINT, body)
      return api.update<Workstation>(ENDPOINT, record.workstation_id, body)
    },
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(ENDPOINT, record!.workstation_id),
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Delete failed'),
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  let title: string
  if (!record) {
    title = 'New Workstation'
  } else if (isEditing) {
    title = `Edit: ${record.full_tool_name}`
  } else {
    title = record.full_tool_name
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
            <Label htmlFor="tool_name">Tool Name *</Label>
            <Input id="tool_name" value={form.tool_name} onChange={(e) => set('tool_name', e.target.value)} placeholder="Tool Name" />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Brand</Label>
            <BrandSelect value={form.brand_id} displayName={form.brand_name} onChange={(id, name) => { set('brand_id', id); set('brand_name', name) }} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="version">Version</Label>
            <Input id="version" value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="Version" />
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
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="Tool Name" value={record?.tool_name} />
          <FieldRow label="Brand" value={record?.brand_name} />
          <FieldRow label="Version" value={record?.version} />
          <div className="col-span-2"><FieldRow label="Tool Types" value={<TypeBadges types={record?.tool_types} />} /></div>
          <div className="col-span-2"><FieldRow label="Plugin Formats" value={<TypeBadges types={record?.plugin_formats} />} /></div>
          <div className="col-span-2"><FieldRow label="Tags" value={<TypeBadges types={record?.tags} />} /></div>
          <div className="col-span-2"><FieldRow label="Description" value={record?.description} /></div>
          <div className="col-span-2"><FieldRow label="Workflow Notes" value={record?.workflow_notes} /></div>
          <FieldRow label="Created" value={record?.created_at ? new Date(record.created_at).toLocaleString() : null} />
          <FieldRow label="Updated" value={record?.updated_at ? new Date(record.updated_at).toLocaleString() : null} />
        </div>
      )}
    </RecordModal>
  )
}
