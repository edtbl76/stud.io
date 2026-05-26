'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import type { WorkbenchRow } from '@/lib/types'

const CATALOG_TYPE_OPTIONS = [
  { value: 'effects', label: 'Effects' },
  { value: 'instruments', label: 'Instruments' },
  { value: 'libraries', label: 'Libraries' },
  { value: 'workstations', label: 'Workstations' },
  { value: 'admin_tools', label: 'Admin Tools' },
  { value: 'composition_tools', label: 'Composition Tools' },
  { value: 'measurement_tools', label: 'Measurement Tools' },
  { value: 'reference_tools', label: 'Reference Tools' },
  { value: 'workflow_tools', label: 'Workflow Tools' },
]

interface CreateRecordModalProps {
  row: WorkbenchRow
  onClose: () => void
  onSaved: () => void
}

export function CreateRecordModal({ row, onClose, onSaved }: Readonly<CreateRecordModalProps>) {
  const [name, setName] = useState(row.disk_name)
  const [vendor, setVendor] = useState(row.disk_vendor)
  const [version, setVersion] = useState(row.disk_version)
  const [format, setFormat] = useState(row.disk_format)
  const [catalogType, setCatalogType] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setIsSaving(true)
    setError(null)
    try {
      const created = await api.create<{ id: string }>(`/catalog/${catalogType}`, { name, vendor, version, format })
      await api.scanner.createLink({ result_id: row.result_id, catalog_record_id: created.id, catalog_record_table: catalogType })
      onSaved()
    } catch {
      setError('Failed to create record. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog open>
      <h2 className="text-base font-semibold mb-4">Create New Record</h2>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Vendor</span>
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} className="border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Version</span>
          <input value={version} onChange={(e) => setVersion(e.target.value)} className="border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Format</span>
          <input value={format} onChange={(e) => setFormat(e.target.value)} className="border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Catalog Type</span>
          <select
            aria-label="Catalog type"
            value={catalogType}
            onChange={(e) => setCatalogType(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="">Select type…</option>
            {CATALOG_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" onClick={handleSave} disabled={!catalogType || isSaving}>Save</button>
      </div>
    </dialog>
  )
}
