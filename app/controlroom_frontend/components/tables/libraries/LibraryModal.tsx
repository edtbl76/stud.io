'use client'

import * as React from 'react'
import { Library, ModelRef, ParentRef } from '@/lib/types'
import { useRecordModal } from '@/lib/useRecordModal'
import { RecordModal } from '@/components/RecordModal'
import { RecordHistoryView } from '@/components/RecordHistoryView'
import { FieldRow } from '@/components/FieldRow'
import { TypeBadges } from '@/components/TypeBadges'
import { ParentLinks } from '@/components/ParentLinks'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { BrandSelect } from '@/components/ui/BrandSelect'
import { ModelSelect } from '@/components/ui/ModelSelect'
import { ParentSelect } from '@/components/ui/ParentSelect'
import { ModelLinks } from '@/components/ModelLinks'

const ENDPOINT = '/libraries'

interface LibraryModalProps {
  record: Library | null
  onClose: () => void
  onMutate: () => void
}

interface ParentId { table_name: string; id: string }

interface FormState {
  library_name: string
  brand_id: string
  brand_name: string
  model_ids: string[]
  model_refs: ModelRef[]
  parent_ids: ParentId[]
  parent_refs: ParentRef[]
  tag_ids: string[]
  description: string
  instrument_notes: string
  recording_notes: string
  attributes: string
}

function getLibraryTitle(mode: 'view' | 'edit' | 'history', record: Library | null): string {
  if (mode === 'history') return `${record?.full_library_name ?? ''} — History`
  if (!record) return 'New Library'
  if (mode === 'edit') return `Edit: ${record.full_library_name}`
  return record.full_library_name
}

function buildLibraryPayload(form: FormState): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (form.library_name) body.library_name = form.library_name
  if (form.brand_id) body.brand_id = form.brand_id
  body.model_ids = form.model_ids
  body.parent_ids = form.parent_ids
  if (form.tag_ids.length) body.tag_ids = form.tag_ids
  if (form.description) body.description = form.description
  if (form.instrument_notes) body.instrument_notes = form.instrument_notes
  if (form.recording_notes) body.recording_notes = form.recording_notes
  if (form.attributes) { try { body.attributes = JSON.parse(form.attributes) } catch {} }
  return body
}

function toForm(record: Library | null): FormState {
  if (!record) {
    return {
      library_name: '', brand_id: '', brand_name: '',
      model_ids: [], model_refs: [], parent_ids: [], parent_refs: [], tag_ids: [],
      description: '', instrument_notes: '', recording_notes: '', attributes: '',
    }
  }
  return {
    library_name: record.library_name ?? '',
    brand_id: record.brand_id ?? '',
    brand_name: record.brand_name ?? '',
    model_ids: record.model_ids ?? [],
    model_refs: record.models ?? [],
    parent_ids: (record.parents ?? []).map(p => ({ table_name: p.table_name, id: p.id })),
    parent_refs: record.parents ?? [],
    tag_ids: record.tag_ids ?? [],
    description: record.description ?? '',
    instrument_notes: record.instrument_notes ?? '',
    recording_notes: record.recording_notes ?? '',
    attributes: record.attributes ? JSON.stringify(record.attributes, null, 2) : '',
  }
}

export function LibraryModal({ record, onClose, onMutate }: Readonly<LibraryModalProps>) {
  const { mode, form, set, error, isCreate, isAdmin, historyUrl, recordModalProps } =
    useRecordModal<Library, FormState>({
      record,
      endpoint: ENDPOINT,
      getRecordId: (r) => r.library_id,
      getHistoryUrl: (r) => `/libraries/${r.library_id}/history`,
      getTitle: getLibraryTitle,
      toForm,
      buildPayload: buildLibraryPayload,
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
            <Label htmlFor="library_name">Library Name *</Label>
            <Input id="library_name" value={form.library_name} onChange={(e) => set('library_name', e.target.value)} placeholder="Library Name" />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Brand</Label>
            <BrandSelect value={form.brand_id} displayName={form.brand_name} onChange={(id, name) => { set('brand_id', id); set('brand_name', name) }} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Models</Label>
            <ModelSelect
              value={form.model_ids}
              selectedModels={form.model_refs}
              onChange={(ids, models) => { set('model_ids', ids); set('model_refs', models) }}
            />
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
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Parents</Label>
            <ParentSelect
              value={form.parent_ids}
              selectedParents={form.parent_refs}
              onChange={(ids, parents) => { set('parent_ids', ids); set('parent_refs', parents) }}
              {...( isCreate ? {} : { excludeTable: 'libraries', excludeId: record!.library_id } )}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="Library Name" value={record?.library_name} />
          <FieldRow label="Brand" value={record?.brand_name} />
          <div className="col-span-2"><FieldRow label="Models" value={<ModelLinks models={record?.models} />} /></div>
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
      </>
      )}
    </RecordModal>
  )
}
