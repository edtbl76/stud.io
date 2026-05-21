'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Gear, GearType, MaintenanceLog } from '@/lib/types'
import { useRecordModal, ModalMode } from '@/lib/useRecordModal'
import { RecordModal } from '@/components/RecordModal'
import { RecordHistoryView } from '@/components/RecordHistoryView'
import { FieldRow } from '@/components/FieldRow'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/NativeSelect'
import { ModelSelectSingle } from '@/components/ui/ModelSelectSingle'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { GUITAR_TYPE_ID } from '@/lib/gearlist'

const ENDPOINT = '/gearlist/gear'
const EVENT_TYPES = ['restring', 'setup', 'repair', 'modification', 'other'] as const
const GEAR_TYPES_ENDPOINT = '/gearlist/gear-types'
const PICKUP_CONFIGS = ['SSS', 'HH', 'HSH', 'SSH'] as const
type PickupConfig = typeof PICKUP_CONFIGS[number]

interface PickupSlot { pos: 'neck' | 'middle' | 'bridge'; label: string }

const PICKUP_SLOTS: Record<PickupConfig, PickupSlot[]> = {
  SSS: [{ pos: 'neck', label: 'Neck (Single)' }, { pos: 'middle', label: 'Middle (Single)' }, { pos: 'bridge', label: 'Bridge (Single)' }],
  HH:  [{ pos: 'neck', label: 'Neck (Humbucker)' }, { pos: 'bridge', label: 'Bridge (Humbucker)' }],
  HSH: [{ pos: 'neck', label: 'Neck (Humbucker)' }, { pos: 'middle', label: 'Middle (Single)' }, { pos: 'bridge', label: 'Bridge (Humbucker)' }],
  SSH: [{ pos: 'neck', label: 'Neck (Single)' }, { pos: 'middle', label: 'Middle (Single)' }, { pos: 'bridge', label: 'Bridge (Humbucker)' }],
}

interface GearModalProps {
  record: Gear | null
  onClose: () => void
  onMutate: () => void
  initialTypeId?: string
}

interface FormState {
  gear_name: string
  gear_type_id: string
  brand_id: string
  model_id: string
  model_name: string
  serial_number: string
  year: string
  notes: string
  num_strings: string
  tuning: string
  pickup_config: string
  pickup_neck_model_id: string
  pickup_neck_model_name: string
  pickup_middle_model_id: string
  pickup_middle_model_name: string
  pickup_bridge_model_id: string
  pickup_bridge_model_name: string
  strings_model_id: string
  strings_model_name: string
}

function toForm(record: Gear | null, initialTypeId = ''): FormState {
  if (!record) {
    return {
      gear_name: '', gear_type_id: initialTypeId,
      brand_id: '', model_id: '', model_name: '',
      serial_number: '', year: '', notes: '',
      num_strings: '', tuning: '', pickup_config: '',
      pickup_neck_model_id: '', pickup_neck_model_name: '',
      pickup_middle_model_id: '', pickup_middle_model_name: '',
      pickup_bridge_model_id: '', pickup_bridge_model_name: '',
      strings_model_id: '', strings_model_name: '',
    }
  }
  return {
    gear_name: record.gear_name,
    gear_type_id: record.gear_type_id ?? '',
    brand_id: record.brand_id ?? '',
    model_id: record.model_id ?? '',
    model_name: record.model_name ?? '',
    serial_number: record.serial_number ?? '',
    year: record.year == null ? '' : String(record.year),
    notes: record.notes ?? '',
    num_strings: record.num_strings == null ? '' : String(record.num_strings),
    tuning: record.tuning ?? '',
    pickup_config: record.pickup_config ?? '',
    pickup_neck_model_id: record.pickup_neck_model_id ?? '',
    pickup_neck_model_name: record.pickup_neck_model_name ?? '',
    pickup_middle_model_id: record.pickup_middle_model_id ?? '',
    pickup_middle_model_name: record.pickup_middle_model_name ?? '',
    pickup_bridge_model_id: record.pickup_bridge_model_id ?? '',
    pickup_bridge_model_name: record.pickup_bridge_model_name ?? '',
    strings_model_id: record.strings_model_id ?? '',
    strings_model_name: record.strings_model_name ?? '',
  }
}

function ns(s: string): string | null { return s.trim() || null }
function ni(s: string): number | null { return s.trim() ? Number.parseInt(s, 10) : null }

function pickupModelId(slots: PickupSlot[] | undefined, pos: PickupSlot['pos'], value: string): string | null {
  return (slots ?? []).some(s => s.pos === pos) ? (value.trim() || null) : null
}

function buildGuitarFields(form: FormState): Record<string, unknown> {
  const slots = form.pickup_config ? PICKUP_SLOTS[form.pickup_config as PickupConfig] : undefined
  return {
    num_strings:            ni(form.num_strings),
    tuning:                 ns(form.tuning),
    pickup_config:          ns(form.pickup_config),
    pickup_neck_model_id:   pickupModelId(slots, 'neck',   form.pickup_neck_model_id),
    pickup_middle_model_id: pickupModelId(slots, 'middle', form.pickup_middle_model_id),
    pickup_bridge_model_id: pickupModelId(slots, 'bridge', form.pickup_bridge_model_id),
    strings_model_id:       ns(form.strings_model_id),
  }
}

function buildGearPayload(form: FormState): Record<string, unknown> {
  const isGuitar = form.gear_type_id === GUITAR_TYPE_ID
  return {
    ...(form.gear_name    && { gear_name:    form.gear_name }),
    ...(form.gear_type_id && { gear_type_id: form.gear_type_id }),
    brand_id:      ns(form.brand_id),
    model_id:      ns(form.model_id),
    serial_number: ns(form.serial_number),
    year:          ni(form.year),
    notes:         ns(form.notes),
    ...(isGuitar && buildGuitarFields(form)),
  }
}

function getGearTitle(mode: ModalMode, record: Gear | null): string {
  if (mode === 'history') return `${record?.gear_name ?? ''} — History`
  if (!record) return 'New Gear'
  if (mode === 'edit') return `Edit: ${record.gear_name}`
  return record.gear_name
}

// ── sub-components ────────────────────────────────────────────────────────────

interface EditSectionProps {
  form: FormState
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  gearTypes: GearType[]
  record: Gear | null
  onMutate: () => void
}

function usePhotoUpload(record: Gear | null, onMutate: () => void) {
  const [error, setError] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !record) return
    setUploading(true)
    setError(null)
    try {
      await api.uploadPhoto(ENDPOINT, record.gear_id, file)
      onMutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return { upload, uploading, error }
}

function GearEditSection({ form, set, gearTypes, record, onMutate }: Readonly<EditSectionProps>) {
  const { upload, uploading, error: uploadError } = usePhotoUpload(record, onMutate)

  return (
    <>
      {uploadError && (
        <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{uploadError}</div>
      )}
      <GearEditForm form={form} set={set} gearTypes={gearTypes} />
      {record && (
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="photo_upload">
            Photo {uploading && <span className="text-muted-foreground">(uploading…)</span>}
          </Label>
          <input id="photo_upload" type="file" accept="image/jpeg,image/png,image/webp"
            className="text-xs" onChange={upload} disabled={uploading} />
        </div>
      )}
    </>
  )
}

interface EditFormProps {
  form: FormState
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  gearTypes: GearType[]
}

function GearEditForm({ form, set, gearTypes }: Readonly<EditFormProps>) {
  const isGuitar = form.gear_type_id === GUITAR_TYPE_ID
  const slots = isGuitar && form.pickup_config ? PICKUP_SLOTS[form.pickup_config as PickupConfig] : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gear_name">Name *</Label>
        <Input id="gear_name" value={form.gear_name} onChange={(e) => set('gear_name', e.target.value)} placeholder="Name" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gear_type_id">Type</Label>
        <NativeSelect id="gear_type_id" value={form.gear_type_id} onChange={(e) => set('gear_type_id', e.target.value)}>
          <option value="">— select type —</option>
          {gearTypes.map((t) => (
            <option key={t.type_id} value={t.type_id}>{t.type_name}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Model</Label>
        <ModelSelectSingle
          value={form.model_id}
          displayName={form.model_name}
          onChange={(id, name, brandId) => { set('model_id', id); set('model_name', name); set('brand_id', brandId ?? '') }}
          typeFilter={isGuitar ? 'Guitar' : undefined}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="serial_number">Serial</Label>
          <Input id="serial_number" value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} placeholder="Serial number" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="year">Year</Label>
          <Input id="year" type="number" value={form.year} onChange={(e) => set('year', e.target.value)} placeholder="Year" />
        </div>
      </div>
      {isGuitar && <GuitarEditFields form={form} set={set} slots={slots} />}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Notes..." />
      </div>
    </div>
  )
}

interface GuitarEditFieldsProps {
  form: FormState
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  slots: PickupSlot[]
}

function GuitarEditFields({ form, set, slots }: Readonly<GuitarEditFieldsProps>) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="num_strings">Strings</Label>
          <Input id="num_strings" type="number" value={form.num_strings} onChange={(e) => set('num_strings', e.target.value)} placeholder="6" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tuning">Tuning</Label>
          <Input id="tuning" value={form.tuning} onChange={(e) => set('tuning', e.target.value)} placeholder="Standard" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pickup_config">Pickup Config</Label>
        <NativeSelect id="pickup_config" value={form.pickup_config} onChange={(e) => set('pickup_config', e.target.value)}>
          <option value="">— none —</option>
          {PICKUP_CONFIGS.map((c) => <option key={c} value={c}>{c}</option>)}
        </NativeSelect>
      </div>
      {slots.map((slot) => {
        const idKey = `pickup_${slot.pos}_model_id` as keyof FormState
        const nameKey = `pickup_${slot.pos}_model_name` as keyof FormState
        const inputId = `pickup_${slot.pos}_model`
        return (
          <div key={slot.pos} className="flex flex-col gap-1.5">
            <Label htmlFor={inputId}>{slot.label}</Label>
            <ModelSelectSingle
              id={inputId}
              value={form[idKey]}
              displayName={form[nameKey]}
              onChange={(id, name) => { set(idKey, id); set(nameKey, name) }}
              typeFilter="Pickup"
              placeholder="Search pickups..."
            />
          </div>
        )
      })}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="strings_model">String Set</Label>
        <ModelSelectSingle
          id="strings_model"
          value={form.strings_model_id}
          displayName={form.strings_model_name}
          onChange={(id, name) => { set('strings_model_id', id); set('strings_model_name', name) }}
          typeFilter="Guitar Strings"
          placeholder="Search strings..."
        />
      </div>
    </>
  )
}

interface ViewDetailsProps { record: Gear; gearTypes: GearType[] }

function GearViewDetails({ record, gearTypes }: Readonly<ViewDetailsProps>) {
  const typeName = gearTypes.find(t => t.type_id === record.gear_type_id)?.type_name ?? record.gear_type_name
  const isGuitar = record.gear_type_id === GUITAR_TYPE_ID
  return (
    <div className="flex flex-col gap-4">
      {record.photo_key && (
        <img
          src={`/api/gearlist/photos/${record.photo_key}`}
          alt={record.gear_name}
          className="w-full rounded-md object-contain max-h-64 bg-muted"
        />
      )}
      <FieldRow label="Type"   value={typeName} />
      <FieldRow label="Serial" value={record.serial_number} />
      <FieldRow label="Year"   value={record.year} />
      {isGuitar && (
        <>
          <FieldRow label="Strings"       value={record.num_strings} />
          <FieldRow label="Tuning"        value={record.tuning} />
          <FieldRow label="Pickup Config" value={record.pickup_config} />
        </>
      )}
      <FieldRow label="Notes"  value={record.notes} />
      <FieldRow label="ID"     value={<code className="text-xs font-mono text-muted-foreground">{record.gear_id}</code>} />
    </div>
  )
}

interface MaintenanceEntryFormProps {
  gearId: string
  onSaved: () => void
  onCancel: () => void
}

function MaintenanceEntryForm({ gearId, onSaved, onCancel }: Readonly<MaintenanceEntryFormProps>) {
  const [eventType, setEventType] = React.useState('restring')
  const [eventDate, setEventDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      await api.create(`${ENDPOINT}/${gearId}/maintenance`, { event_type: eventType, event_date: eventDate, notes })
      onSaved()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {submitError && <p className="text-xs text-destructive">{submitError}</p>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mlog_type">Type</Label>
        <NativeSelect id="mlog_type" value={eventType} onChange={(e) => setEventType(e.target.value)}>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mlog_date">Date</Label>
        <Input id="mlog_date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mlog_notes">Notes</Label>
        <Textarea id="mlog_notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." />
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  )
}

function MaintenanceSection({ gearId }: Readonly<{ gearId: string }>) {
  const [log, setLog] = React.useState<MaintenanceLog[]>([])
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [showForm, setShowForm] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    api.list<MaintenanceLog>(`${ENDPOINT}/${gearId}/maintenance`)
      .then((data) => { if (!cancelled) setLog(data) })
      .catch(() => { if (!cancelled) setLog([]) })
    return () => { cancelled = true }
  }, [gearId, refreshKey])

  function handleSaved() {
    setRefreshKey((k) => k + 1)
    setShowForm(false)
  }

  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Maintenance Log</p>
        {!showForm && (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>Log entry</Button>
        )}
      </div>
      {log.length > 0 && (
        <ul className="flex flex-col gap-2 mb-4">
          {log.map((entry) => (
            <li key={entry.log_id} className="flex flex-col gap-0.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide">{entry.event_type}</span>
                {entry.event_date && (
                  <span className="text-xs text-muted-foreground">{formatDate(entry.event_date)}</span>
                )}
              </div>
              {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
            </li>
          ))}
        </ul>
      )}
      {showForm && (
        <MaintenanceEntryForm gearId={gearId} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      )}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export function GearModal({ record, onClose, onMutate, initialTypeId }: Readonly<GearModalProps>) {
  const { data: gearTypes = [] } = useQuery({
    queryKey: ['/gearlist/gear-types'],
    queryFn: () => api.list<GearType>(GEAR_TYPES_ENDPOINT),
  })

  const toFormWithDefault = React.useCallback(
    (r: Gear | null) => toForm(r, initialTypeId),
    [initialTypeId],
  )

  const { mode, form, set, error, isAdmin, historyUrl, recordModalProps } =
    useRecordModal<Gear, FormState>({
      record,
      endpoint: ENDPOINT,
      getRecordId: (r) => r.gear_id,
      getHistoryUrl: (r) => `${ENDPOINT}/${r.gear_id}/history`,
      getTitle: getGearTitle,
      toForm: toFormWithDefault,
      buildPayload: buildGearPayload,
      onClose,
      onMutate,
    })

  return (
    <RecordModal {...recordModalProps}>
      {mode === 'history' ? (
        <RecordHistoryView historyUrl={historyUrl} isAdmin={isAdmin} onUndo={() => { onMutate(); onClose() }} />
      ) : (
        <>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
          )}
          {mode === 'edit' ? (
            <GearEditSection form={form} set={set} gearTypes={gearTypes} record={record} onMutate={onMutate} />
          ) : (
            <>
              <GearViewDetails record={record!} gearTypes={gearTypes} />
              <MaintenanceSection gearId={record!.gear_id} />
            </>
          )}
        </>
      )}
    </RecordModal>
  )
}
