'use client'

import * as React from 'react'
import { Tool, ModelRef } from '@/lib/types'
import { useRecordModal, ModalMode } from '@/lib/useRecordModal'
import { RecordModal } from '@/components/RecordModal'
import { RecordHistoryView } from '@/components/RecordHistoryView'
import { FieldRow } from '@/components/FieldRow'
import { TypeBadges } from '@/components/TypeBadges'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { BrandSelect } from '@/components/ui/BrandSelect'
import { formatDate } from '@/lib/utils'
import { ModelSelect } from '@/components/ui/ModelSelect'
import { ModelLinks } from '@/components/ModelLinks'

interface ToolModalProps {
  record: Tool | null
  category: string
  onClose: () => void
  onMutate: () => void
}

interface FormState {
  tool_name: string
  brand_id: string
  brand_name: string
  version: string
  model_ids: string[] | null  // null preserves "not set" from the original record; [] means explicitly empty
  model_refs: ModelRef[]
  tool_type_ids: string[]
  plugin_format_ids: string[]
  tag_ids: string[]
  description: string
  workflow_notes: string
}

function getToolTitle(mode: 'view' | 'edit' | 'history', record: Tool | null, categoryLabel: string): string {
  if (mode === 'history') return `${record?.full_tool_name ?? ''} — History`
  if (!record) return `New ${categoryLabel} Tool`
  if (mode === 'edit') return `Edit: ${record.full_tool_name}`
  return record.full_tool_name
}

function buildToolPayload(form: FormState): Record<string, unknown> {
  const strings: Record<string, string> = {
    tool_name: form.tool_name, brand_id: form.brand_id, version: form.version,
    description: form.description, workflow_notes: form.workflow_notes,
  }
  const arrays: Record<string, string[]> = {
    tool_type_ids: form.tool_type_ids,
    plugin_format_ids: form.plugin_format_ids,
    tag_ids: form.tag_ids,
  }
  const body: Record<string, unknown> = {
    ...Object.fromEntries(Object.entries(strings).filter(([, v]) => v)),
    ...Object.fromEntries(Object.entries(arrays).filter(([, v]) => v.length)),
  }
  if (form.model_ids !== null) body.model_ids = form.model_ids
  return body
}

function toForm(record: Tool | null): FormState {
  if (!record) {
    return {
      tool_name: '', brand_id: '', brand_name: '', version: '',
      model_ids: [], model_refs: [],
      tool_type_ids: [], plugin_format_ids: [], tag_ids: [],
      description: '', workflow_notes: '',
    }
  }
  return {
    tool_name: record.tool_name ?? '',
    brand_id: record.brand_id ?? '',
    brand_name: record.brand_name ?? '',
    version: record.version ?? '',
    model_ids: record.model_ids,
    model_refs: record.models ?? [],
    tool_type_ids: record.tool_type_ids ?? [],
    plugin_format_ids: record.plugin_format_ids ?? [],
    tag_ids: record.tag_ids ?? [],
    description: record.description ?? '',
    workflow_notes: record.workflow_notes ?? '',
  }
}

interface ToolEditFormProps {
  form: FormState
  set: (key: keyof FormState, value: FormState[keyof FormState]) => void
}

function ToolEditForm({ form, set }: Readonly<ToolEditFormProps>) {
  return (
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
        <Label>Models</Label>
        <ModelSelect
          value={form.model_ids ?? []}
          selectedModels={form.model_refs}
          onChange={(ids, models) => { set('model_ids', ids); set('model_refs', models) }}
        />
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
  )
}

function ToolViewForm({ record }: Readonly<{ record: Tool }>) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FieldRow label="Tool Name" value={record.tool_name} />
      <FieldRow label="Brand" value={record.brand_name} />
      <FieldRow label="Version" value={record.version} />
      <div className="col-span-2"><FieldRow label="Models" value={<ModelLinks models={record.models} />} /></div>
      <div className="col-span-2"><FieldRow label="Tool Types" value={<TypeBadges types={record.tool_types} />} /></div>
      <div className="col-span-2"><FieldRow label="Plugin Formats" value={<TypeBadges types={record.plugin_formats} />} /></div>
      <div className="col-span-2"><FieldRow label="Tags" value={<TypeBadges types={record.tags} />} /></div>
      <div className="col-span-2"><FieldRow label="Description" value={record.description} /></div>
      <div className="col-span-2"><FieldRow label="Workflow Notes" value={record.workflow_notes} /></div>
      <FieldRow label="Created" value={formatDate(record.created_at)} />
      <FieldRow label="Updated" value={formatDate(record.updated_at)} />
    </div>
  )
}

export function ToolModal({ record, category, onClose, onMutate }: Readonly<ToolModalProps>) {
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1)
  const getTitle = (m: ModalMode, r: Tool | null) => getToolTitle(m, r, categoryLabel)

  const { mode, form, set, error, isAdmin, historyUrl, recordModalProps } =
    useRecordModal<Tool, FormState>({
      record,
      endpoint: `/studio/tools/${category}`,
      getRecordId: (r) => r.tool_id,
      getHistoryUrl: (r) => `/tools/${category}/${r.tool_id}/history`,
      getTitle,
      toForm,
      buildPayload: buildToolPayload,
      onClose,
      onMutate,
    })

  return (
    <RecordModal {...recordModalProps}>
      {mode === 'history' ? (
        <RecordHistoryView
          historyUrl={historyUrl}
          isAdmin={isAdmin}
          onUndo={() => { onMutate(); onClose() }}
        />
      ) : (
      <>
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
      )}

      {mode === 'edit' ? <ToolEditForm form={form} set={set} /> : record && <ToolViewForm record={record} />}
      </>
      )}
    </RecordModal>
  )
}
