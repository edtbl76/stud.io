'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { APIKeyManager } from '@/components/tables/scanner/APIKeyManager'

interface ReleaseInfo {
  key: string
  version: string
  released_at: string
  size_bytes: number
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function LatestReleaseCard({ release }: Readonly<{ release: ReleaseInfo }>) {
  const [downloading, setDownloading] = React.useState(false)

  function handleDownload() {
    setDownloading(true)
    try {
      const a = document.createElement('a')
      a.href = `/api/scanner/download/url?key=${encodeURIComponent(release.key)}`
      a.download = release.key.split('/').pop() ?? 'plugin-scanner.zip'
      a.click()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="rounded border border-border bg-card p-4 space-y-3" data-testid="latest-release-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground" data-testid="release-version">
            plugin-scanner {release.version}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(release.released_at).toLocaleDateString()} · {formatBytes(release.size_bytes)} · macOS Apple Silicon
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
          data-testid="download-button"
        >
          {downloading ? 'Preparing...' : 'Download'}
        </button>
      </div>
    </div>
  )
}

function ReleaseHistoryCollapsible() {
  const [open, setOpen] = React.useState(false)
  const [history, setHistory] = React.useState<ReleaseInfo[]>([])
  const [loading, setLoading] = React.useState(false)

  async function handleToggle() {
    if (open) {
      setOpen(false)
      return
    }
    if (history.length === 0) {
      setLoading(true)
      try {
        const res = await fetch('/api/scanner/download/history')
        if (!res.ok) {
          toast.error('Failed to load release history')
          return
        }
        const data = await res.json()
        setHistory(data)
      } catch {
        toast.error('Failed to load release history')
        return
      } finally {
        setLoading(false)
      }
    }
    setOpen(true)
  }

  return (
    <div data-testid="release-history-collapsible">
      <button
        onClick={handleToggle}
        className="text-xs text-muted-foreground underline mt-2"
        data-testid="release-history-toggle"
      >
        {open ? 'Hide past releases' : 'Show past releases'}
      </button>

      {open && (
        <div className="mt-2 space-y-1" data-testid="release-history-list">
          {loading && (
            <p className="text-xs text-muted-foreground">Loading...</p>
          )}
          {!loading && history.length === 0 && (
            <p className="text-xs text-muted-foreground">No past releases.</p>
          )}
          {history.map(r => (
            <div key={r.key} className="flex items-center justify-between text-xs py-1 border-b border-border/40">
              <span className="text-foreground font-mono">{r.version}</span>
              <span className="text-muted-foreground">
                {new Date(r.released_at).toLocaleDateString()} · {formatBytes(r.size_bytes)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DownloadSection() {
  const [latest, setLatest] = React.useState<ReleaseInfo | null | undefined>(undefined)

  React.useEffect(() => {
    fetch('/api/scanner/download/latest')
      .then(res => {
        if (res.status === 204 || !res.ok) return null
        return res.json()
      })
      .then(data => setLatest(data))
      .catch(() => setLatest(null))
  }, [])

  if (latest === undefined) return null
  if (latest === null) return null

  return (
    <section className="space-y-2" data-testid="download-section">
      <LatestReleaseCard release={latest} />
      <ReleaseHistoryCollapsible />
    </section>
  )
}

export default function PluginScannerPage() {
  return (
    <div className="px-6 py-6 space-y-8 max-w-2xl" data-testid="plugin-scanner-page">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Plugin Scanner</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Download the macOS binary and manage API keys for scanner authentication.
        </p>
      </div>

      <DownloadSection />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">API Keys</h3>
        <p className="text-xs text-muted-foreground">
          Generate keys for the plugin-scanner binary to authenticate with ControlRoom.
          Each key is shown once — store it in <code className="font-mono bg-muted px-1 rounded">~/.plugin-scanner.yml</code>.
        </p>
        <APIKeyManager />
      </section>
    </div>
  )
}
