'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScannerModalContent } from './ScannerModalContent'
import type { FieldSource, RuleCreationResult, WorkbenchRow } from '@/lib/types'

interface Field {
  key: 'name' | 'vendor' | 'version'
  label: string
  diskValue: string
  catalogValue: string | null
  sourceKey: 'nameSource' | 'vendorSource' | 'versionSource'
}

interface ResolutionState {
  nameSource: FieldSource | null
  vendorSource: FieldSource | null
  versionSource: FieldSource | null
}

interface SingleResolutionModalProps {
  row: WorkbenchRow
  onClose: () => void
  onSaved: () => void
  onFireRuleToasts: (result: RuleCreationResult) => void
}

function buildPatch(fields: Field[], sources: ResolutionState): Record<string, string> {
  const patch: Record<string, string> = {}
  for (const f of fields) {
    const chosen = sources[f.sourceKey]
    patch[f.key] = (f.diskValue === f.catalogValue || chosen === 'disk')
      ? f.diskValue
      : (f.catalogValue ?? f.diskValue)
  }
  return patch
}

function collectRulePromises(fields: Field[], sources: ResolutionState): Promise<RuleCreationResult>[] {
  const promises: Promise<RuleCreationResult>[] = []
  for (const f of fields) {
    if (f.diskValue === f.catalogValue || sources[f.sourceKey] !== 'catalog') continue
    if (f.key === 'vendor' && f.catalogValue != null) promises.push(api.scanner.createVendorRule({ disk_vendor: f.diskValue, catalog_vendor: f.catalogValue }))
    else if (f.key === 'name' && f.catalogValue != null) promises.push(api.scanner.createNameRule({ disk_name: f.diskValue, catalog_name: f.catalogValue }))
  }
  return promises
}

export function SingleResolutionModal({ row, onClose, onSaved, onFireRuleToasts }: Readonly<SingleResolutionModalProps>) {
  const fields: Field[] = [
    { key: 'name', label: 'Name', diskValue: row.disk_name, catalogValue: row.catalog_record_name, sourceKey: 'nameSource' },
    { key: 'vendor', label: 'Vendor', diskValue: row.disk_vendor, catalogValue: row.catalog_record_vendor, sourceKey: 'vendorSource' },
    { key: 'version', label: 'Version', diskValue: row.disk_version, catalogValue: row.catalog_record_version, sourceKey: 'versionSource' },
  ]

  const differingFields = fields.filter((f) => f.diskValue !== f.catalogValue)

  const [sources, setSources] = useState<ResolutionState>({
    nameSource: null, vendorSource: null, versionSource: null,
  })
  const [error, setError] = useState<string | null>(null)
  const [aliasError, setAliasError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const allResolved = differingFields.every((f) => sources[f.sourceKey] !== null)
  const hasMatchedRecord = row.catalog_record_id != null && row.catalog_record_table != null

  function setSource(sourceKey: keyof ResolutionState, value: FieldSource) {
    setSources((prev) => ({ ...prev, [sourceKey]: value }))
  }

  async function handleSetNameAlias() {
    const catalogRecordId = row.catalog_record_id
    const catalogTable = row.catalog_record_table
    if (catalogRecordId == null || catalogTable == null) return
    setAliasError(null)
    try {
      await api.scanner.createAlias({
        disk_name: row.disk_name,
        catalog_record_id: catalogRecordId,
        catalog_table: catalogTable,
      })
      toast.success(`Alias set: ${row.disk_name} → ${row.catalog_record_name}`)
    } catch (err) {
      setAliasError(err instanceof Error ? err.message : 'Failed to set alias. Please try again.')
    }
  }

  async function handleSave() {
    setIsSaving(true)
    setError(null)

    try {
      await api.update(`/catalog/${row.catalog_record_table}`, row.catalog_record_id!, buildPatch(fields, sources))
    } catch {
      setError('Failed to save. Please try again.')
      setIsSaving(false)
      return
    }

    const results = await Promise.all(collectRulePromises(fields, sources))
    results.forEach((r) => onFireRuleToasts(r))
    setIsSaving(false)
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <ScannerModalContent>
        <DialogHeader>
          <DialogTitle>Resolve Match</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left pb-2">Field</th>
            <th className="text-left pb-2">Disk</th>
            <th className="text-left pb-2">Catalog</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const differs = f.diskValue !== f.catalogValue
            return (
              <tr key={f.key} className="border-t border-border">
                <td className="py-2 pr-4 font-medium">{f.label}</td>
                {differs ? (
                  <>
                    <td className="py-2 pr-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={f.key}
                          value="disk"
                          checked={sources[f.sourceKey] === 'disk'}
                          onChange={() => setSource(f.sourceKey, 'disk')}
                        />
                        {f.diskValue}
                      </label>
                    </td>
                    <td className="py-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={f.key}
                          value="catalog"
                          checked={sources[f.sourceKey] === 'catalog'}
                          onChange={() => setSource(f.sourceKey, 'catalog')}
                        />
                        {f.catalogValue}
                      </label>
                    </td>
                  </>
                ) : (
                  <td colSpan={2} className="py-2">{f.diskValue}</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>
      )}
      {aliasError && (
        <p role="alert" className="mt-3 text-sm text-destructive">{aliasError}</p>
      )}
        </div>

        <DialogFooter>
          <button type="button" onClick={onClose}>Cancel</button>
          {hasMatchedRecord && (
            <button type="button" data-testid="set-name-alias" onClick={handleSetNameAlias}>Set Name Alias</button>
          )}
          <button type="button" onClick={handleSave} disabled={!allResolved || isSaving}>Save</button>
        </DialogFooter>
      </ScannerModalContent>
    </Dialog>
  )
}
