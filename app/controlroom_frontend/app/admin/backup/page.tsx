'use client'

import * as React from 'react'
import { Download, Upload, ShieldCheck, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5150'

type Status = { type: 'success' | 'error'; message: string } | null

interface VerifyTableResult {
  table: string
  rows_expected: number
  rows_actual: number
  hash_match: boolean
  passed: boolean
}

interface VerifyResult {
  passed: boolean
  created_at: string
  tables: VerifyTableResult[]
}

export default function BackupRestorePage() {
  const { token } = useAuth()

  const [backupStatus, setBackupStatus] = React.useState<Status>(null)
  const [backupLoading, setBackupLoading] = React.useState(false)

  const [restoreFile, setRestoreFile] = React.useState<File | null>(null)
  const [restoreStatus, setRestoreStatus] = React.useState<Status>(null)
  const [restoreLoading, setRestoreLoading] = React.useState(false)
  const restoreFileRef = React.useRef<HTMLInputElement>(null)

  const [verifyFile, setVerifyFile] = React.useState<File | null>(null)
  const [verifyLoading, setVerifyLoading] = React.useState(false)
  const [verifyResult, setVerifyResult] = React.useState<VerifyResult | null>(null)
  const [verifyError, setVerifyError] = React.useState<string | null>(null)
  const verifyFileRef = React.useRef<HTMLInputElement>(null)

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
      if (restoreFileRef.current) restoreFileRef.current.value = ''
    } catch (e) {
      setRestoreStatus({ type: 'error', message: e instanceof Error ? e.message : 'Restore failed' })
    } finally {
      setRestoreLoading(false)
    }
  }

  async function handleVerify() {
    if (!verifyFile) return
    setVerifyLoading(true)
    setVerifyResult(null)
    setVerifyError(null)
    try {
      const form = new FormData()
      form.append('file', verifyFile)
      const res = await fetch(`${API}/admin/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? res.statusText)
      }
      const data: VerifyResult = await res.json()
      setVerifyResult(data)
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setVerifyLoading(false)
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
          Download a full SQL dump of the current database with an embedded verification manifest.
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
      <section className="mb-8">
        <h3 className="text-sm font-medium text-foreground mb-1">Restore</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Upload a <code className="text-primary">.sql</code> backup file to restore the database.{' '}
          <span className="text-destructive ml-1 font-medium">This will overwrite existing data.</span>
        </p>
        <div className="flex items-center gap-3 mb-4">
          <input
            ref={restoreFileRef}
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

      <div className="border-t border-border mb-8" />

      {/* Verify */}
      <section>
        <h3 className="text-sm font-medium text-foreground mb-1">Verify Backup</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Upload a backup file to confirm it restores exactly what was backed up.
          The file is restored to a temporary database, hashes are compared, and the database is dropped.
        </p>
        <div className="flex items-center gap-3 mb-4">
          <input
            ref={verifyFileRef}
            type="file"
            accept=".sql"
            onChange={(e) => {
              setVerifyFile(e.target.files?.[0] ?? null)
              setVerifyResult(null)
              setVerifyError(null)
            }}
            className="text-xs text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:text-xs file:rounded file:border file:border-border file:bg-muted file:text-foreground file:cursor-pointer hover:file:bg-muted/80"
          />
        </div>
        <button
          onClick={handleVerify}
          disabled={!verifyFile || verifyLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {verifyLoading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <ShieldCheck className="h-4 w-4" />}
          Verify Backup
        </button>

        {verifyError && (
          <div className="flex items-center gap-2 mt-3 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {verifyError.includes('manifest') || verifyError.includes('Re-download')
              ? 'This file was not created with manifest support. Re-download a fresh backup to enable verification.'
              : verifyError}
          </div>
        )}

        {verifyResult && (
          <div className="mt-4">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium mb-3 ${
              verifyResult.passed
                ? 'bg-green-500/15 text-green-400'
                : 'bg-destructive/15 text-destructive'
            }`}>
              {verifyResult.passed
                ? <CheckCircle className="h-3.5 w-3.5" />
                : <AlertCircle className="h-3.5 w-3.5" />}
              {verifyResult.passed ? 'PASSED' : 'FAILED'}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-1.5 pr-4 font-medium">Table</th>
                    <th className="text-right py-1.5 pr-4 font-medium">Expected</th>
                    <th className="text-right py-1.5 pr-4 font-medium">Actual</th>
                    <th className="text-center py-1.5 pr-4 font-medium">Hash</th>
                    <th className="text-center py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {verifyResult.tables.map((row) => (
                    <tr
                      key={row.table}
                      className={`border-b border-border/50 ${row.passed ? 'text-foreground' : 'text-destructive'}`}
                    >
                      <td className="py-1.5 pr-4 font-mono">{row.table}</td>
                      <td className="py-1.5 pr-4 text-right">{row.rows_expected}</td>
                      <td className="py-1.5 pr-4 text-right">{row.rows_actual}</td>
                      <td className="py-1.5 pr-4 text-center">{row.hash_match ? '✓' : '✗'}</td>
                      <td className="py-1.5 text-center font-medium">{row.passed ? 'PASS' : 'FAIL'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
