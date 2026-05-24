'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import type { FieldChoice, PatternRuleInput, RuleCreationResult, WorkbenchRow } from '@/lib/types'

const CATALOG_TYPE_OPTIONS = [
  { value: 'effects', label: 'Effects' },
  { value: 'instruments', label: 'Instruments' },
  { value: 'libraries', label: 'Libraries' },
  { value: 'workstations', label: 'Workstations' },
]

interface Field {
  key: 'name' | 'vendor' | 'version'
  label: string
  valueA: string
  valueB: string
  catalogValue: string | null
  choiceKey: 'nameChoice' | 'vendorChoice' | 'versionChoice'
}

interface CollisionState {
  nameChoice: FieldChoice | null
  vendorChoice: FieldChoice | null
  versionChoice: FieldChoice | null
}

interface NewRecordState {
  name: string
  vendor: string
  version: string
  catalogType: string
}

interface CollisionModalProps {
  rowA: WorkbenchRow
  rowB: WorkbenchRow
  onClose: () => void
  onSaved: () => void
  onFireRuleToasts: (result: RuleCreationResult) => void
}

export function CollisionModal({ rowA, rowB, onClose, onSaved, onFireRuleToasts }: Readonly<CollisionModalProps>) {
  const fields: Field[] = [
    { key: 'name', label: 'Name', valueA: rowA.disk_name, valueB: rowB.disk_name, catalogValue: rowA.catalog_record_name, choiceKey: 'nameChoice' },
    { key: 'vendor', label: 'Vendor', valueA: rowA.disk_vendor, valueB: rowB.disk_vendor, catalogValue: rowA.catalog_record_vendor, choiceKey: 'vendorChoice' },
    { key: 'version', label: 'Version', valueA: rowA.disk_version, valueB: rowB.disk_version, catalogValue: rowA.catalog_record_version, choiceKey: 'versionChoice' },
  ]

  const [choices, setChoices] = useState<CollisionState>({ nameChoice: null, vendorChoice: null, versionChoice: null })
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newRecord, setNewRecord] = useState<NewRecordState>({
    name: rowA.disk_name, vendor: rowA.disk_vendor, version: rowA.disk_version, catalogType: '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const allResolved = fields.every((f) => choices[f.choiceKey] !== null)

  const nameAliasEligible =
    rowA.disk_vendor === rowB.disk_vendor &&
    rowA.disk_vendor === rowA.catalog_record_vendor &&
    rowA.disk_version === rowB.disk_version &&
    rowA.disk_version === rowA.catalog_record_version

  function setChoice(choiceKey: keyof CollisionState, value: FieldChoice) {
    setChoices((prev) => ({ ...prev, [choiceKey]: value }))
  }

  function resolveValue(f: Field): string {
    const c = choices[f.choiceKey]
    if (c === 'a') return f.valueA
    if (c === 'b') return f.valueB
    return f.catalogValue ?? f.valueA
  }

  async function handleSave() {
    setIsSaving(true)
    const patch: Record<string, string> = {}
    for (const f of fields) patch[f.key] = resolveValue(f)
    await api.update(`/catalog/${rowA.catalog_record_table}`, rowA.catalog_record_id!, patch)

    const rulePromises: Promise<RuleCreationResult>[] = []
    for (const f of fields) {
      if (choices[f.choiceKey] !== 'catalog') continue
      if (f.key === 'vendor') rulePromises.push(api.scanner.createVendorRule({ disk_vendor: f.valueA, catalog_vendor: f.catalogValue! }))
      if (f.key === 'name') rulePromises.push(api.scanner.createNameRule({ disk_name: f.valueA, catalog_name: f.catalogValue! }))
    }
    const results = await Promise.all(rulePromises)
    results.forEach((r) => onFireRuleToasts(r))
    setIsSaving(false)
    onSaved()
  }

  async function handleSetNameAlias() {
    const input: PatternRuleInput = {
      label: `${rowA.disk_name} → ${rowB.disk_name}`,
      pattern: rowA.disk_name,
      match_fields: ['name'],
      action: 'alias_to_match',
      enabled: true,
    }
    const result = await api.scanner.createPatternRule(input)
    onFireRuleToasts(result)
    onSaved()
  }

  async function handleCreateSave() {
    setIsSaving(true)
    const created = await api.create<{ id: string }>(`/catalog/${newRecord.catalogType}`, {
      name: newRecord.name, vendor: newRecord.vendor, version: newRecord.version,
    })
    await api.scanner.createLink({ result_id: rowA.result_id, catalog_record_id: created.id, catalog_record_table: newRecord.catalogType })
    setIsSaving(false)
    onSaved()
  }

  if (showCreateForm) {
    return (
      <dialog open>
        <h2 className="text-base font-semibold mb-4">Create New Record</h2>
        <div className="flex flex-col gap-2">
          <input aria-label="Name" value={newRecord.name} onChange={(e) => setNewRecord((p) => ({ ...p, name: e.target.value }))} />
          <input aria-label="Vendor" value={newRecord.vendor} onChange={(e) => setNewRecord((p) => ({ ...p, vendor: e.target.value }))} />
          <input aria-label="Version" value={newRecord.version} onChange={(e) => setNewRecord((p) => ({ ...p, version: e.target.value }))} />
          <select aria-label="Catalog type" value={newRecord.catalogType} onChange={(e) => setNewRecord((p) => ({ ...p, catalogType: e.target.value }))}>
            <option value="">Select type…</option>
            {CATALOG_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setShowCreateForm(false)}>Back</button>
          <button type="button" onClick={handleCreateSave} disabled={!newRecord.catalogType || isSaving}>Save</button>
        </div>
      </dialog>
    )
  }

  return (
    <dialog open>
      <h2 className="text-base font-semibold mb-4">Resolve Collision</h2>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left pb-2">Field</th>
            <th className="text-left pb-2">Result A</th>
            <th className="text-left pb-2">Result B</th>
            <th className="text-left pb-2">Catalog</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.key} className="border-t border-border">
              <td className="py-2 pr-4 font-medium">{f.label}</td>
              <td className="py-2 pr-4">
                <label className="flex items-center gap-2">
                  <input type="radio" name={f.key} value="a" checked={choices[f.choiceKey] === 'a'} onChange={() => setChoice(f.choiceKey, 'a')} />
                  {f.valueA}
                </label>
              </td>
              <td className="py-2 pr-4">
                <label className="flex items-center gap-2">
                  <input type="radio" name={f.key} value="b" checked={choices[f.choiceKey] === 'b'} onChange={() => setChoice(f.choiceKey, 'b')} />
                  {f.valueB}
                </label>
              </td>
              <td className="py-2">
                <label className="flex items-center gap-2">
                  <input type="radio" name={f.key} value="catalog" checked={choices[f.choiceKey] === 'catalog'} onChange={() => setChoice(f.choiceKey, 'catalog')} />
                  {f.catalogValue}
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex gap-2 flex-wrap">
        <button type="button" onClick={handleSetNameAlias} disabled={!nameAliasEligible}>Set Name Alias</button>
        <button type="button" onClick={() => setShowCreateForm(true)}>Create New Record</button>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" onClick={handleSave} disabled={!allResolved || isSaving}>Save</button>
      </div>
    </dialog>
  )
}
