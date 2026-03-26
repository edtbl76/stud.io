'use client'

import * as React from 'react'
import { Download, Upload, CheckCircle, AlertCircle, Loader2, FileSpreadsheet } from 'lucide-react'

const ALL_TABLES = [
  { key: 'effects',           label: 'Effects' },
  { key: 'instruments',       label: 'Instruments' },
  { key: 'libraries',         label: 'Libraries' },
  { key: 'brands',            label: 'Brands' },
  { key: 'models',            label: 'Models' },
  { key: 'workstations',      label: 'Workstations' },
  { key: 'workflow_tools',    label: 'Workflow Tools' },
  { key: 'measurement_tools', label: 'Measurement Tools' },
  { key: 'reference_tools',   label: 'Reference Tools' },
  { key: 'composition_tools', label: 'Composition Tools' },
  { key: 'admin_tools',       label: 'Admin Tools' },
]

interface ImportError {
  sheet: string
  row: number
  column: string
  value: string
  message: string
}

interface ImportSummaryRow {
  sheet: string
  creates: number
  updates: number
}

interface ImportResult {
  summary: ImportSummaryRow[]
  total_creates: number
  total_updates: number
}

type Status = { type: 'success' | 'error'; message: string } | null

function TableChecklist({
  selected,
  onChange,
}: Readonly<{
  selected: Set<string>
  onChange: (next: Set<string>) => void
}>) {
  function handleToggle(key: string) {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(next)
  }
  function handleAll() { onChange(new Set(ALL_TABLES.map((t) => t.key))) }
  function handleNone() { onChange(new Set()) }

  return (
    <div>
      <div className="flex gap-3 mb-2">
        <button onClick={handleAll} className="text-xs text-primary hover:underline">Select all</button>
        <button onClick={handleNone} className="text-xs text-muted-foreground hover:underline">Clear</button>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        {ALL_TABLES.map((t) => (
          <label key={t.key} className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(t.key)}
              onChange={() => handleToggle(t.key)}
              className="accent-primary"
            />
            {t.label}
          </label>
        ))}
      </div>
    </div>
  )
}

async function downloadXlsx(url: string, defaultName: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error((err as { detail?: string }).detail ?? res.statusText)
  }
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = /filename=(.+)/.exec(disposition)
  const filename = match ? match[1] : defaultName
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
  URL.revokeObjectURL(href)
  return filename
}

export default function ImportExportPage() {
  const [exportSelected, setExportSelected] = React.useState<Set<string>>(
    new Set(ALL_TABLES.map((t) => t.key))
  )
  const [exportLoading, setExportLoading] = React.useState(false)
  const [templateLoading, setTemplateLoading] = React.useState(false)
  const [exportStatus, setExportStatus] = React.useState<Status>(null)

  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [importLoading, setImportLoading] = React.useState(false)
  const [importErrors, setImportErrors] = React.useState<ImportError[] | null>(null)
  const [importResult, setImportResult] = React.useState<ImportResult | null>(null)
  const importFileRef = React.useRef<HTMLInputElement>(null)

  function tableParams(selected: Set<string>) {
    return Array.from(selected).join(',')
  }

  async function handleExport() {
    if (!exportSelected.size) return
    setExportLoading(true)
    setExportStatus(null)
    try {
      const filename = await downloadXlsx(
        `/api/admin/export/xlsx?tables=${tableParams(exportSelected)}`,
        'controlroom_export.xlsx'
      )
      setExportStatus({ type: 'success', message: `Downloaded ${filename}` })
    } catch (e) {
      setExportStatus({ type: 'error', message: e instanceof Error ? e.message : 'Export failed' })
    } finally {
      setExportLoading(false)
    }
  }

  async function handleTemplate() {
    if (!exportSelected.size) return
    setTemplateLoading(true)
    setExportStatus(null)
    try {
      const filename = await downloadXlsx(
        `/api/admin/export/template?tables=${tableParams(exportSelected)}`,
        'controlroom_template.xlsx'
      )
      setExportStatus({ type: 'success', message: `Downloaded ${filename}` })
    } catch (e) {
      setExportStatus({ type: 'error', message: e instanceof Error ? e.message : 'Template failed' })
    } finally {
      setTemplateLoading(false)
    }
  }

  async function handleImport() {
    if (!importFile) return
    setImportLoading(true)
    setImportErrors(null)
    setImportResult(null)
    try {
      const form = new FormData()
      form.append('file', importFile)
      const res = await fetch('/api/admin/import/xlsx', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        const detail = (err as { detail?: { errors?: ImportError[] } | string }).detail
        if (detail && typeof detail === 'object' && 'errors' in detail) {
          setImportErrors(detail.errors ?? [])
        } else {
          throw new Error(typeof detail === 'string' ? detail : res.statusText)
        }
        return
      }
      const data: ImportResult = await res.json()
      setImportResult(data)
      setImportFile(null)
      if (importFileRef.current) importFileRef.current.value = ''
    } catch (e) {
      setImportErrors([{
        sheet: '', row: 0, column: '', value: '',
        message: e instanceof Error ? e.message : 'Import failed',
      }])
    } finally {
      setImportLoading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImportFile(e.target.files?.[0] ?? null)
    setImportErrors(null)
    setImportResult(null)
  }

  return (
    <div className="flex flex-col h-full px-6 py-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-foreground mb-1">Import / Export</h2>
      <p className="text-xs text-muted-foreground mb-8">
        Export data to <code className="text-primary">.xlsx</code>, download empty templates, or import a filled template.
      </p>

      <section className="mb-8">
        <h3 className="text-sm font-medium text-foreground mb-1">Export / Template</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Select tables to include. <strong>Export Data</strong> downloads current records.{' '}
          <strong>Download Template</strong> generates an empty file with headers and dropdown validation.
        </p>
        <TableChecklist selected={exportSelected} onChange={setExportSelected} />
        <div className="flex gap-3 mt-4">
          <button
            onClick={handleExport}
            disabled={exportLoading || !exportSelected.size}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export Data
          </button>
          <button
            onClick={handleTemplate}
            disabled={templateLoading || !exportSelected.size}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded border border-border text-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
          >
            {templateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Download Template
          </button>
        </div>
        {exportStatus && <StatusMessage status={exportStatus} />}
      </section>

      <div className="border-t border-border mb-8" />

      <section>
        <h3 className="text-sm font-medium text-foreground mb-1">Import</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Upload a filled template. Rows with an <strong>ID</strong> column update existing records;
          rows without one create new records. All lookup values must match existing names exactly.
        </p>
        <div className="mb-4">
          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="text-xs text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:text-xs file:rounded file:border file:border-border file:bg-muted file:text-foreground file:cursor-pointer hover:file:bg-muted/80"
          />
        </div>
        <button
          onClick={handleImport}
          disabled={!importFile || importLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
        >
          {importLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Import
        </button>

        {importResult && <ImportSuccess result={importResult} />}
        {importErrors && importErrors.length > 0 && <ImportErrorTable errors={importErrors} />}
      </section>
    </div>
  )
}

function ImportSuccess({ result }: Readonly<{ result: ImportResult }>) {
  return (
    <div className="mt-4">
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium mb-3 bg-green-500/15 text-green-400">
        <CheckCircle className="h-3.5 w-3.5" />
        Import complete — {result.total_creates} created, {result.total_updates} updated
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b border-border">
            <th className="text-left py-1.5 pr-6 font-medium">Sheet</th>
            <th className="text-right py-1.5 pr-6 font-medium">Created</th>
            <th className="text-right py-1.5 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {result.summary.map((row) => (
            <tr key={row.sheet} className="border-b border-border/50">
              <td className="py-1.5 pr-6">{row.sheet}</td>
              <td className="py-1.5 pr-6 text-right">{row.creates}</td>
              <td className="py-1.5 text-right">{row.updates}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ImportErrorTable({ errors }: Readonly<{ errors: ImportError[] }>) {
  return (
    <div className="mt-4">
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium mb-3 bg-destructive/15 text-destructive">
        <AlertCircle className="h-3.5 w-3.5" />
        {errors.length} validation error{errors.length === 1 ? '' : 's'} — nothing was imported
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="text-left py-1.5 pr-4 font-medium">Sheet</th>
              <th className="text-right py-1.5 pr-4 font-medium">Row</th>
              <th className="text-left py-1.5 pr-4 font-medium">Column</th>
              <th className="text-left py-1.5 font-medium">Problem</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((err, i) => (
              <tr key={`${err.sheet}-${err.row}-${err.column}-${i}`} className="border-b border-border/50 text-destructive">
                <td className="py-1.5 pr-4">{err.sheet || '—'}</td>
                <td className="py-1.5 pr-4 text-right">{err.row || '—'}</td>
                <td className="py-1.5 pr-4">{err.column || '—'}</td>
                <td className="py-1.5">{err.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusMessage({ status }: Readonly<{ status: NonNullable<Status> }>) {
  return (
    <div className={`flex items-center gap-2 mt-3 text-xs ${status.type === 'success' ? 'text-green-400' : 'text-destructive'}`}>
      {status.type === 'success'
        ? <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
        : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />}
      {status.message}
    </div>
  )
}
