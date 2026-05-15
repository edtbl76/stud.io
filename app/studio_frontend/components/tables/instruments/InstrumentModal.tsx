'use client'

import * as React from 'react'
import { Instrument, ModelRef, ParentRef, PluginPathEntry } from '@/lib/types'
import { useRecordModal } from '@/lib/useRecordModal'
import { RecordModal } from '@/components/RecordModal'
import { RecordHistoryView } from '@/components/RecordHistoryView'
import { FieldRow } from '@/components/FieldRow'
import { TypeBadges } from '@/components/TypeBadges'
import { ParentLinks } from '@/components/ParentLinks'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { BrandSelect } from '@/components/ui/BrandSelect'
import { ModelSelect } from '@/components/ui/ModelSelect'
import { ParentSelect, ParentId } from '@/components/ui/ParentSelect'
import { ModelLinks } from '@/components/ModelLinks'
import { PluginPathsEditor } from '@/components/tables/scanner/PluginPathsEditor'

const ENDPOINT = '/studio/session/instruments'

interface InstrumentModalProps {
  record: Instrument | null
  onClose: () => void
  onMutate: () => void
}

interface FormState {
  instrument_name: string
  brand_id: string
  brand_name: string
  version: string
  model_ids: string[]
  model_refs: ModelRef[]
  parent_ids: ParentId[]
  parent_refs: ParentRef[]
  instrument_type_ids: string[]
  tool_type_ids: string[]
  plugin_format_ids: string[]
  tag_ids: string[]
  description: string
  instrument_notes: string
  recording_notes: string
  artist_reference: string
  attributes: string
  disk_paths: PluginPathEntry[]
}

type SetFn = <K extends keyof FormState>(key: K, value: FormState[K]) => void

function getInstrumentTitle(mode: 'view' | 'edit' | 'history', record: Instrument | null): string {
  if (mode === 'history') return `${record?.full_instrument_name ?? ''} — History`
  if (!record) return 'New Instrument'
  if (mode === 'edit') return `Edit: ${record.full_instrument_name}`
  return record.full_instrument_name
}

function buildInstrumentPayload(form: FormState): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (form.instrument_name) body.instrument_name = form.instrument_name
  if (form.brand_id) body.brand_id = form.brand_id
  body.version = form.version
  body.model_ids = form.model_ids
  body.parent_ids = form.parent_ids
  if (form.instrument_type_ids.length) body.instrument_type_ids = form.instrument_type_ids
  if (form.tool_type_ids.length) body.tool_type_ids = form.tool_type_ids
  if (form.plugin_format_ids.length) body.plugin_format_ids = form.plugin_format_ids
  if (form.tag_ids.length) body.tag_ids = form.tag_ids
  body.description = form.description
  body.instrument_notes = form.instrument_notes
  body.recording_notes = form.recording_notes
  body.artist_reference = form.artist_reference || null
  if (form.attributes) { try { body.attributes = JSON.parse(form.attributes) } catch {} }
  body.disk_paths = form.disk_paths
  return body
}

function toForm(record: Instrument | null): FormState {
  if (!record) {
    return {
      instrument_name: '', brand_id: '', brand_name: '', version: '',
      model_ids: [], model_refs: [], parent_ids: [], parent_refs: [],
      instrument_type_ids: [], tool_type_ids: [], plugin_format_ids: [], tag_ids: [],
      description: '', instrument_notes: '', recording_notes: '', artist_reference: '', attributes: '', disk_paths: [],
    }
  }
  return {
    instrument_name: record.instrument_name ?? '',
    brand_id: record.brand_id ?? '',
    brand_name: record.brand_name ?? '',
    version: record.version ?? '',
    model_ids: record.model_ids ?? [],
    model_refs: record.models ?? [],
    parent_ids: (record.parents ?? []).map(p => ({ table_name: p.table_name, id: p.id })),
    parent_refs: record.parents ?? [],
    instrument_type_ids: record.instrument_type_ids ?? [],
    tool_type_ids: record.tool_type_ids ?? [],
    plugin_format_ids: record.plugin_format_ids ?? [],
    tag_ids: record.tag_ids ?? [],
    description: record.description ?? '',
    instrument_notes: record.instrument_notes ?? '',
    recording_notes: record.recording_notes ?? '',
    artist_reference: record.artist_reference ?? '',
    attributes: record.attributes ? JSON.stringify(record.attributes, null, 2) : '',
    disk_paths: record.disk_paths ?? [],
  }
}

interface InstrumentEditFormProps { form: FormState; set: SetFn; excludeProps: Record<string, unknown> }

function InstrumentEditForm({ form, set, excludeProps }: Readonly<InstrumentEditFormProps>) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label htmlFor="instrument_name">Instrument Name *</Label>
        <Input id="instrument_name" value={form.instrument_name} onChange={(e) => set('instrument_name', e.target.value)} placeholder="Instrument Name" />
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
        <ModelSelect value={form.model_ids} selectedModels={form.model_refs} onChange={(ids, models) => { set('model_ids', ids); set('model_refs', models) }} />
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
        <Label htmlFor="artist_reference">Artist Reference</Label>
        <Input id="artist_reference" value={form.artist_reference} onChange={(e) => set('artist_reference', e.target.value)} placeholder="Artist reference" />
      </div>
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label htmlFor="attributes">Attributes (JSON)</Label>
        <Textarea id="attributes" value={form.attributes} onChange={(e) => set('attributes', e.target.value)} rows={4} className="font-mono text-xs" placeholder="{}" />
      </div>
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label>Parents</Label>
        <ParentSelect value={form.parent_ids} selectedParents={form.parent_refs}
          onChange={(ids, p) => { set('parent_ids', ids); set('parent_refs', p) }}
          {...excludeProps} />
      </div>
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label>Plugin Paths</Label>
        <PluginPathsEditor value={form.disk_paths} onChange={(v) => set('disk_paths', v)} />
      </div>
    </div>
  )
}

function InstrumentViewFields({ record }: Readonly<{ record: Instrument | null }>) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FieldRow label="Instrument Name" value={record?.instrument_name} />
      <FieldRow label="Brand" value={record?.brand_name} />
      <FieldRow label="Version" value={record?.version} />
      <div className="col-span-2"><FieldRow label="Models" value={<ModelLinks models={record?.models} />} /></div>
      <div className="col-span-2"><FieldRow label="Instrument Types" value={<TypeBadges types={record?.instrument_types} />} /></div>
      <div className="col-span-2"><FieldRow label="Tool Types" value={<TypeBadges types={record?.tool_types} />} /></div>
      <div className="col-span-2"><FieldRow label="Plugin Formats" value={<TypeBadges types={record?.plugin_formats} />} /></div>
      <div className="col-span-2"><FieldRow label="Tags" value={<TypeBadges types={record?.tags} />} /></div>
      <div className="col-span-2"><FieldRow label="Parents" value={<ParentLinks parents={record?.parents} />} /></div>
      <div className="col-span-2"><FieldRow label="Description" value={record?.description} /></div>
      <div className="col-span-2"><FieldRow label="Instrument Notes" value={record?.instrument_notes} /></div>
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
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label>Plugin Paths</Label>
        <PluginPathsEditor value={record?.disk_paths ?? []} onChange={() => {}} readOnly />
      </div>
      <FieldRow label="Created" value={record?.created_at ? new Date(record.created_at).toLocaleString() : null} />
      <FieldRow label="Updated" value={record?.updated_at ? new Date(record.updated_at).toLocaleString() : null} />
    </div>
  )
}

export function InstrumentModal({ record, onClose, onMutate }: Readonly<InstrumentModalProps>) {
  const { mode, form, set, error, isCreate, isAdmin, historyUrl, recordModalProps } =
    useRecordModal<Instrument, FormState>({
      record,
      endpoint: ENDPOINT,
      getRecordId: (r) => r.instrument_id,
      getHistoryUrl: (r) => `${ENDPOINT}/${r.instrument_id}/history`,
      getTitle: getInstrumentTitle,
      toForm,
      buildPayload: buildInstrumentPayload,
      onClose,
      onMutate,
    })
  const excludeProps = isCreate ? {} : { excludeTable: 'instruments' as const, excludeId: record!.instrument_id }

  return (
    <RecordModal {...recordModalProps}>
      {mode === 'history' ? (
        <RecordHistoryView historyUrl={historyUrl} isAdmin={isAdmin} onUndo={() => { onMutate(); onClose() }} />
      ) : (
        <>
          {error && <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>}
          {mode === 'edit'
            ? <InstrumentEditForm form={form} set={set} excludeProps={excludeProps} />
            : <InstrumentViewFields record={record} />
          }
        </>
      )}
    </RecordModal>
  )
}
