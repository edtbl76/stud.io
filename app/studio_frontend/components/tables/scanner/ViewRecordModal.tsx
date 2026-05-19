'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FieldRow } from '@/components/FieldRow'
import type { ScanResult } from '@/lib/types'

type FieldChoice = 'disk' | 'catalog'

interface ConflictChoices {
  name: FieldChoice
  vendor: FieldChoice
  version: FieldChoice
}

export interface ConflictResolution {
  name: string
  vendor: string
  version: string
}

interface ViewRecordModalProps {
  result: ScanResult
  onClose: () => void
  onAcknowledge?: (resultId: string) => void
  onSaveConflict?: (resultId: string, values: ConflictResolution) => void
  onSaved?: () => void
}

function useConflictResolution(result: ScanResult) {
  const [choices, setChoices] = React.useState<ConflictChoices>({
    name: 'catalog',
    vendor: 'catalog',
    version: 'disk',
  })
  function handleChoiceChange(field: keyof ConflictChoices, value: FieldChoice) {
    setChoices(prev => ({ ...prev, [field]: value }))
  }
  function resolvedValues(): ConflictResolution {
    const { match } = result
    return {
      name:    choices.name    === 'disk' ? result.name    : (match?.record_name    ?? result.name),
      vendor:  choices.vendor  === 'disk' ? result.vendor  : (match?.record_vendor  ?? result.vendor),
      version: choices.version === 'disk' ? result.version : (match?.record_version ?? result.version),
    }
  }
  return { choices, handleChoiceChange, resolvedValues }
}

function ConflictFieldRow({ label, diskValue, catalogValue, choice, onChange, testIdPrefix }: Readonly<{
  label: string
  diskValue: string
  catalogValue: string
  choice: FieldChoice
  onChange: (c: FieldChoice) => void
  testIdPrefix: string
}>) {
  if (diskValue === catalogValue) return <FieldRow label={label} value={diskValue} />
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <label className="flex items-center gap-3 cursor-pointer rounded px-2 py-1.5 hover:bg-muted/40">
        <input type="radio" name={testIdPrefix} checked={choice === 'disk'} onChange={() => onChange('disk')} data-testid={`${testIdPrefix}-disk`} className="accent-primary" />
        <span className="text-xs text-muted-foreground w-10 shrink-0">Disk</span>
        <span className="font-mono text-sm text-foreground">{diskValue}</span>
      </label>
      <label className="flex items-center gap-3 cursor-pointer rounded px-2 py-1.5 hover:bg-muted/40">
        <input type="radio" name={testIdPrefix} checked={choice === 'catalog'} onChange={() => onChange('catalog')} data-testid={`${testIdPrefix}-catalog`} className="accent-primary" />
        <span className="text-xs text-muted-foreground w-10 shrink-0">Catalog</span>
        <span className="font-mono text-sm text-amber-500">{catalogValue}</span>
      </label>
    </div>
  )
}

function ConflictBody({ result, choices, onChange }: Readonly<{
  result: ScanResult
  choices: ConflictChoices
  onChange: (field: keyof ConflictChoices, value: FieldChoice) => void
}>) {
  const { match } = result
  return (
    <div className="px-6 py-4 space-y-4">
      <FieldRow label="Table" value={<span className="font-mono">{match?.record_table ?? '—'}</span>} />
      <ConflictFieldRow label="Name" diskValue={result.name} catalogValue={match?.record_name ?? result.name} choice={choices.name} onChange={(v) => onChange('name', v)} testIdPrefix="conflict-name" />
      <ConflictFieldRow label="Vendor" diskValue={result.vendor} catalogValue={match?.record_vendor ?? result.vendor} choice={choices.vendor} onChange={(v) => onChange('vendor', v)} testIdPrefix="conflict-vendor" />
      <ConflictFieldRow label="Version" diskValue={result.version} catalogValue={match?.record_version ?? result.version} choice={choices.version} onChange={(v) => onChange('version', v)} testIdPrefix="conflict-version" />
      <FieldRow label="Record ID" value={<span className="font-mono text-xs break-all">{match?.record_id ?? '—'}</span>} />
    </div>
  )
}

function CompareFieldRow({ label, diskValue, catalogValue }: Readonly<{ label: string; diskValue: string; catalogValue: string }>) {
  const differs = diskValue !== catalogValue
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex gap-6 text-sm">
        <span className="text-xs text-muted-foreground w-12 shrink-0 pt-0.5">Disk</span>
        <span className="font-mono text-foreground">{diskValue}</span>
      </div>
      <div className="flex gap-6 text-sm">
        <span className="text-xs text-muted-foreground w-12 shrink-0 pt-0.5">Catalog</span>
        <span className={`font-mono ${differs ? 'text-amber-500' : 'text-foreground'}`}>{catalogValue}</span>
      </div>
    </div>
  )
}

function CompareBody({ result }: Readonly<{ result: ScanResult }>) {
  const { match } = result
  return (
    <div className="px-6 py-4 space-y-4">
      <FieldRow label="Table" value={<span className="font-mono">{match?.record_table ?? '—'}</span>} />
      <CompareFieldRow label="Name" diskValue={result.name} catalogValue={match?.record_name ?? result.name} />
      <CompareFieldRow label="Vendor" diskValue={result.vendor} catalogValue={match?.record_vendor ?? result.vendor} />
      <CompareFieldRow label="Version" diskValue={result.version} catalogValue={match?.record_version ?? result.version} />
      <FieldRow label="Record ID" value={<span className="font-mono text-xs break-all">{match?.record_id ?? '—'}</span>} />
    </div>
  )
}

function ViewBody({ result }: Readonly<{ result: ScanResult }>) {
  const { match } = result
  return (
    <div className="px-6 py-4 space-y-4">
      <FieldRow label="Table" value={<span className="font-mono">{match?.record_table ?? '—'}</span>} />
      <FieldRow label="Name" value={match?.record_name ?? result.name} />
      <FieldRow label="Vendor" value={match?.record_vendor ?? result.vendor} />
      <FieldRow label="Version" value={match?.record_version ?? result.version} />
      <FieldRow label="Record ID" value={<span className="font-mono text-xs break-all">{match?.record_id ?? '—'}</span>} />
    </div>
  )
}

function ModalFooter({ result, onAcknowledge, onSaveConflict, onClose, onSave }: Readonly<{
  result: ScanResult
  onAcknowledge?: (resultId: string) => void
  onSaveConflict?: (resultId: string, values: ConflictResolution) => void
  onClose: () => void
  onSave: () => void
}>) {
  const isConflicted = result.status === 'conflicted'
  const showAcknowledge = !isConflicted && !result.confirmed_at && !!onAcknowledge
  return (
    <>
      {showAcknowledge && (
        <div className="mr-auto">
          <Button variant="success" onClick={() => onAcknowledge?.(result.result_id)} data-testid="view-record-acknowledge-button">
            Acknowledge
          </Button>
        </div>
      )}
      {isConflicted && onSaveConflict && (
        <div className="mr-auto">
          <Button variant="success" onClick={onSave} data-testid="view-record-save-conflict-button">
            Save
          </Button>
        </div>
      )}
      <Button variant="ghost" size="sm" onClick={onClose} data-testid="view-record-close-button">
        Close
      </Button>
    </>
  )
}

export function ViewRecordModal({ result, onClose, onAcknowledge, onSaveConflict, onSaved: _ }: Readonly<ViewRecordModalProps>) {
  const isConflicted = result.status === 'conflicted'
  const isUnconfirmed = result.status === 'unconfirmed'
  const isConfirmed = !!result.confirmed_at
  const { choices, handleChoiceChange, resolvedValues } = useConflictResolution(result)

  function handleSave() {
    onSaveConflict?.(result.result_id, resolvedValues())
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="view-record-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Catalog Record
            {isConfirmed && (
              <span className="text-xs font-normal text-green-600 bg-green-500/10 rounded px-2 py-0.5" data-testid="view-record-confirmed-badge">
                Confirmed
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        {isConflicted && <ConflictBody result={result} choices={choices} onChange={handleChoiceChange} />}
        {isUnconfirmed && <CompareBody result={result} />}
        {!isConflicted && !isUnconfirmed && <ViewBody result={result} />}
        <DialogFooter>
          <ModalFooter result={result} onAcknowledge={onAcknowledge} onSaveConflict={onSaveConflict} onClose={onClose} onSave={handleSave} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
