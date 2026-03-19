'use client'

import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Brand } from '@/lib/types'
import { RecordModal } from '@/components/RecordModal'
import { RecordHistoryView } from '@/components/RecordHistoryView'
import { FieldRow } from '@/components/FieldRow'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/MultiSelect'

const ENDPOINT = '/brands'

interface BrandModalProps {
  record: Brand | null
  onClose: () => void
  onMutate: () => void
}

interface FormState {
  legal_name: string
  brand_name: string
  entity_type_id: string[]
  website: string
  description: string
  founder: string
  years: string
}

function getBrandTitle(mode: 'view' | 'edit' | 'history', record: Brand | null): string {
  if (mode === 'history') return `${record?.brand_name ?? record?.legal_name ?? ''} — History`
  if (!record) return 'New Brand'
  if (mode === 'edit') return `Edit: ${record.brand_name ?? record.legal_name ?? ''}`
  return record.brand_name ?? record.legal_name ?? ''
}

function buildBrandPayload(form: FormState): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (form.legal_name) body.legal_name = form.legal_name
  if (form.brand_name) body.brand_name = form.brand_name
  if (form.entity_type_id.length > 0) body.entity_type_id = form.entity_type_id[0]
  if (form.website) body.website = form.website
  if (form.description) body.description = form.description
  if (form.founder) body.founder = form.founder
  if (form.years) body.years = form.years
  return body
}

interface BrandEditProps {
  form: FormState
  set: (key: keyof FormState, value: string | string[]) => void
}

function BrandEditForm({ form, set }: Readonly<BrandEditProps>) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label htmlFor="legal_name">Legal Name *</Label>
        <Input
          id="legal_name"
          value={form.legal_name}
          onChange={(e) => set('legal_name', e.target.value)}
          placeholder="Legal Name"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand_name">Brand Name</Label>
        <Input
          id="brand_name"
          value={form.brand_name}
          onChange={(e) => set('brand_name', e.target.value)}
          placeholder="Brand Name"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Entity Type</Label>
        <MultiSelect
          configSlug="entity-types"
          value={form.entity_type_id}
          onChange={(v) => set('entity_type_id', v)}
          singleSelect
          placeholder="Select type..."
        />
      </div>
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label htmlFor="website">Website</Label>
        <Input
          id="website"
          value={form.website}
          onChange={(e) => set('website', e.target.value)}
          placeholder="https://..."
          type="url"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="founder">Founder</Label>
        <Input
          id="founder"
          value={form.founder}
          onChange={(e) => set('founder', e.target.value)}
          placeholder="Founder name"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="years">Years</Label>
        <Input
          id="years"
          value={form.years}
          onChange={(e) => set('years', e.target.value)}
          placeholder="e.g. 1980–present"
        />
      </div>
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Description..."
          rows={4}
        />
      </div>
    </div>
  )
}

function BrandViewDetails({ record }: Readonly<{ record: Brand }>) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FieldRow label="Legal Name" value={record.legal_name} />
      <FieldRow label="Brand Name" value={record.brand_name} />
      <FieldRow label="Entity Type" value={record.entity_type_name} />
      <FieldRow label="Years" value={record.years} />
      <FieldRow label="Founder" value={record.founder} />
      <FieldRow
        label="Website"
        value={
          record.website ? (
            <a
              href={record.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm"
            >
              {record.website}
            </a>
          ) : null
        }
      />
      <div className="col-span-2">
        <FieldRow label="Description" value={record.description} />
      </div>
      <FieldRow
        label="Created"
        value={record.created_at ? new Date(record.created_at).toLocaleString() : null}
      />
      <FieldRow
        label="Updated"
        value={record.updated_at ? new Date(record.updated_at).toLocaleString() : null}
      />
    </div>
  )
}

function toForm(record: Brand | null): FormState {
  if (!record) {
    return {
      legal_name: '',
      brand_name: '',
      entity_type_id: [],
      website: '',
      description: '',
      founder: '',
      years: '',
    }
  }
  return {
    legal_name: record.legal_name ?? '',
    brand_name: record.brand_name ?? '',
    entity_type_id: record.entity_type_id ? [record.entity_type_id] : [],
    website: record.website ?? '',
    description: record.description ?? '',
    founder: record.founder ?? '',
    years: record.years ?? '',
  }
}

export function BrandModal({ record, onClose, onMutate }: Readonly<BrandModalProps>) {
  const { role } = useAuth()
  const isCreate = record === null
  const [mode, setMode] = React.useState<'view' | 'edit' | 'history'>(isCreate ? 'edit' : 'view')
  const [form, setForm] = React.useState<FormState>(() => toForm(record))
  const [error, setError] = React.useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = buildBrandPayload(form)
      if (record) return api.update<Brand>(ENDPOINT, record.brand_id, body)
      return api.create<Brand>(ENDPOINT, body)
    },
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(ENDPOINT, record!.brand_id),
    onSuccess: () => { onMutate(); onClose() },
    onError: (err) => setError(err instanceof Error ? err.message : 'Delete failed'),
  })

  function set(key: keyof FormState, value: string | string[]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const title = getBrandTitle(mode, record)

  return (
    <RecordModal
      title={title}
      isAdmin={role === 'admin'}
      isEditing={mode === 'edit'}
      isHistory={mode === 'history'}
      onEdit={() => setMode('edit')}
      onHistory={record ? () => setMode('history') : undefined}
      onSave={() => {
        setError(null)
        saveMutation.mutate()
      }}
      onDelete={() => deleteMutation.mutate()}
      onClose={onClose}
      isSaving={saveMutation.isPending}
      isDeleting={deleteMutation.isPending}
    >
      {mode === 'history' ? (
        <RecordHistoryView
          historyUrl={`/brands/${record!.brand_id}/history`}
          isAdmin={role === 'admin'}
          onUndo={() => { onMutate(); onClose() }}
        />
      ) : (
      <>
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
          {error}
        </div>
      )}

      {mode === 'edit'
        ? <BrandEditForm form={form} set={set} />
        : record && <BrandViewDetails record={record} />
      }
      </>
      )}
    </RecordModal>
  )
}
