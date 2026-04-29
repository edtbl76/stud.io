'use client'

import * as React from 'react'
import { LookupOut } from '@/lib/types'
import { useRecordModal, ModalMode } from '@/lib/useRecordModal'
import { RecordModal } from '@/components/RecordModal'
import { RecordHistoryView } from '@/components/RecordHistoryView'
import { FieldRow } from '@/components/FieldRow'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface ConfigModalProps {
  record: LookupOut | null
  slug: string
  endpoint?: string
  onClose: () => void
  onMutate: () => void
}

interface FormState {
  type_name: string
  type_description: string
}

function toForm(record: LookupOut | null): FormState {
  if (!record) return { type_name: '', type_description: '' }
  return {
    type_name: record.type_name ?? '',
    type_description: record.type_description ?? '',
  }
}

function buildConfigPayload(form: FormState): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (form.type_name) body.type_name = form.type_name
  if (form.type_description) body.type_description = form.type_description
  return body
}

function getConfigTitle(mode: ModalMode, record: LookupOut | null): string {
  if (mode === 'history') return `${record?.type_name ?? ''} — History`
  if (!record) return 'New Entry'
  if (mode === 'edit') return `Edit: ${record.type_name}`
  return record.type_name
}

export function ConfigModal({ record, slug, endpoint, onClose, onMutate }: Readonly<ConfigModalProps>) {
  const resolvedEndpoint = endpoint ?? `/studio/config/${slug}`
  const { mode, form, set, error, isAdmin, historyUrl, recordModalProps } =
    useRecordModal<LookupOut, FormState>({
      record,
      endpoint: resolvedEndpoint,
      getRecordId: (r) => r.type_id,
      getHistoryUrl: endpoint ? undefined : (r) => `/config/${slug}/${r.type_id}/history`,
      getTitle: getConfigTitle,
      toForm,
      buildPayload: buildConfigPayload,
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
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type_name">Name *</Label>
            <Input
              id="type_name"
              value={form.type_name}
              onChange={(e) => set('type_name', e.target.value)}
              placeholder="Name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type_description">Description</Label>
            <Textarea
              id="type_description"
              value={form.type_description}
              onChange={(e) => set('type_description', e.target.value)}
              rows={4}
              placeholder="Description..."
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <FieldRow label="Name" value={record?.type_name} />
          <FieldRow label="Description" value={record?.type_description} />
          <FieldRow label="ID" value={<code className="text-xs font-mono text-muted-foreground">{record?.type_id}</code>} />
        </div>
      )}
      </>
      )}
    </RecordModal>
  )
}
