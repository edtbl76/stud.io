'use client'

import * as React from 'react'
import { Workstation, PluginPathEntry } from '@/lib/types'
import { useRecordModal } from '@/lib/useRecordModal'
import { RecordModal } from '@/components/RecordModal'
import { RecordHistoryView } from '@/components/RecordHistoryView'
import { FieldRow } from '@/components/FieldRow'
import { TypeBadges } from '@/components/TypeBadges'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { BrandSelect } from '@/components/ui/BrandSelect'
import { PluginPathsEditor } from '@/components/tables/scanner/PluginPathsEditor'

const ENDPOINT = '/studio/session/workstations'

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
  disk_paths: PluginPathEntry[]
}

function getWorkstationTitle(mode: 'view' | 'edit' | 'history', record: Workstation | null): string {
  if (mode === 'history') return `${record?.full_tool_name ?? ''} — History`
  if (!record) return 'New Workstation'
  if (mode === 'edit') return `Edit: ${record.full_tool_name}`
  return record.full_tool_name
}

function buildWorkstationPayload(form: FormState): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (form.tool_name) body.tool_name = form.tool_name
  if (form.brand_id) body.brand_id = form.brand_id
  body.version = form.version
  if (form.tool_type_ids.length) body.tool_type_ids = form.tool_type_ids
  if (form.plugin_format_ids.length) body.plugin_format_ids = form.plugin_format_ids
  if (form.tag_ids.length) body.tag_ids = form.tag_ids
  body.description = form.description
  body.workflow_notes = form.workflow_notes
  body.disk_paths = form.disk_paths
  return body
}

function toForm(record: Workstation | null): FormState {
  if (!record) {
    return {
      tool_name: '', brand_id: '', brand_name: '', version: '',
      tool_type_ids: [], plugin_format_ids: [], tag_ids: [],
      description: '', workflow_notes: '', disk_paths: [],
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
    disk_paths: record.disk_paths ?? [],
  }
}

export function WorkstationModal({ record, onClose, onMutate }: Readonly<WorkstationModalProps>) {
  const { mode, form, set, error, isAdmin, historyUrl, recordModalProps } =
    useRecordModal<Workstation, FormState>({
      record,
      endpoint: ENDPOINT,
      getRecordId: (r) => r.workstation_id,
      getHistoryUrl: (r) => `${ENDPOINT}/${r.workstation_id}/history`,
      getTitle: getWorkstationTitle,
      toForm,
      buildPayload: buildWorkstationPayload,
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

      {mode === 'edit' ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="tool_name">Workstation Name *</Label>
            <Input id="tool_name" value={form.tool_name} onChange={(e) => set('tool_name', e.target.value)} placeholder="Workstation Name" />
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
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Plugin Paths</Label>
            <PluginPathsEditor value={form.disk_paths} onChange={(v) => set('disk_paths', v)} />
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
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Plugin Paths</Label>
            <PluginPathsEditor value={record?.disk_paths ?? []} onChange={() => {}} readOnly />
          </div>
          <FieldRow label="Created" value={record?.created_at ? new Date(record.created_at).toLocaleString() : null} />
          <FieldRow label="Updated" value={record?.updated_at ? new Date(record.updated_at).toLocaleString() : null} />
        </div>
      )}
      </>
      )}
    </RecordModal>
  )
}
