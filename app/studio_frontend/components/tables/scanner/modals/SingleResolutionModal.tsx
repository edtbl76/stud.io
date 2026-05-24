'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
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
  const [isSaving, setIsSaving] = useState(false)

  const allResolved = differingFields.every((f) => sources[f.sourceKey] !== null)

  function setSource(sourceKey: keyof ResolutionState, value: FieldSource) {
    setSources((prev) => ({ ...prev, [sourceKey]: value }))
  }

  async function handleSave() {
    setIsSaving(true)
    setError(null)

    const patch: Record<string, string> = {}
    for (const f of fields) {
      if (f.diskValue === f.catalogValue) {
        patch[f.key] = f.diskValue
      } else {
        const chosen = sources[f.sourceKey]
        patch[f.key] = chosen === 'disk' ? f.diskValue : (f.catalogValue ?? f.diskValue)
      }
    }

    try {
      await api.update(`/catalog/${row.catalog_record_table}`, row.catalog_record_id!, patch)
    } catch {
      setError('Failed to save. Please try again.')
      setIsSaving(false)
      return
    }

    const rulePromises: Promise<RuleCreationResult>[] = []
    for (const f of differingFields) {
      if (sources[f.sourceKey] !== 'catalog') continue
      if (f.key === 'vendor') {
        rulePromises.push(api.scanner.createVendorRule({ disk_vendor: f.diskValue, catalog_vendor: f.catalogValue! }))
      } else if (f.key === 'name') {
        rulePromises.push(api.scanner.createNameRule({ disk_name: f.diskValue, catalog_name: f.catalogValue! }))
      }
    }

    const results = await Promise.all(rulePromises)
    results.forEach((r) => onFireRuleToasts(r))

    setIsSaving(false)
    onSaved()
  }

  return (
    <dialog open>
      <h2 className="text-base font-semibold mb-4">Resolve Match</h2>

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

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" onClick={handleSave} disabled={!allResolved || isSaving}>Save</button>
      </div>
    </dialog>
  )
}
