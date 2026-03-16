'use client'

import * as React from 'react'
import { Download, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5150'

type Status = { type: 'success' | 'error'; message: string } | null

export default function BackupRestorePage() {
  const { token } = useAuth()
  const [restoreFile, setRestoreFile] = React.useState<File | null>(null)
  const [backupStatus, setBackupStatus] = React.useState<Status>(null)
  const [restoreStatus, setRestoreStatus] = React.useState<Status>(null)
  const [backupLoading, setBackupLoading] = React.useState(false)
  const [restoreLoading, setRestoreLoading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  async function handleBackup() {
    setBackupLoading(true)
    setBackupStatus(null)
    try {
      const res = await fetch(`${API}/admin/backup`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? res.statusText)
      }
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename=(.+)/)
      const filename = match ? match[1] : 'controlroomdb.sql'
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setBackupStatus({ type: 'success', message: `Downloaded ${filename}` })
    } catch (e) {
      setBackupStatus({ type: 'error', message: e instanceof Error ? e.message : 'Backup failed' })
    } finally {
      setBackupLoading(false)
    }
  }

  async function handleRestore() {
    if (!restoreFile) return
    setRestoreLoading(true)
    setRestoreStatus(null)
    try {
      const form = new FormData()
      form.append('file', restoreFile)
      const res = await fetch(`${API}/admin/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? res.statusText)
      }
      setRestoreStatus({ type: 'success', message: 'Database restored successfully' })
      setRestoreFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setRestoreStatus({ type: 'error', message: e instanceof Error ? e.message : 'Restore failed' })
    } finally {
      setRestoreLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full px-6 py-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-foreground mb-1">Backup & Restore</h2>
      <p className="text-xs text-muted-foreground mb-8">
        Manage the <code className="text-primary">controlroomdb</code> database.
      </p>

      {/* Backup */}
      <section className="mb-8">
        <h3 className="text-sm font-medium text-foreground mb-1">Backup</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Download a full SQL dump of the current database.
        </p>
        <button
          onClick={handleBackup}
          disabled={backupLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {backupLoading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Download className="h-4 w-4" />}
          Download Backup
        </button>
        {backupStatus && <StatusMessage status={backupStatus} />}
      </section>

      <div className="border-t border-border mb-8" />

      {/* Restore */}
      <section>
        <h3 className="text-sm font-medium text-foreground mb-1">Restore</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Upload a <code className="text-primary">.sql</code> backup file to restore the database.
          <span className="text-destructive ml-1 font-medium">This will overwrite existing data.</span>
        </p>
        <div className="flex items-center gap-3 mb-4">
          <input
            ref={fileRef}
            type="file"
            accept=".sql"
            onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
            className="text-xs text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:text-xs file:rounded file:border file:border-border file:bg-muted file:text-foreground file:cursor-pointer hover:file:bg-muted/80"
          />
        </div>
        <button
          onClick={handleRestore}
          disabled={!restoreFile || restoreLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-40 transition-colors"
        >
          {restoreLoading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Upload className="h-4 w-4" />}
          Restore Database
        </button>
        {restoreStatus && <StatusMessage status={restoreStatus} />}
      </section>
    </div>
  )
}

function StatusMessage({ status }: { status: NonNullable<Status> }) {
  return (
    <div className={`flex items-center gap-2 mt-3 text-xs ${
      status.type === 'success' ? 'text-green-400' : 'text-destructive'
    }`}>
      {status.type === 'success'
        ? <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
        : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />}
      {status.message}
    </div>
  )
}
