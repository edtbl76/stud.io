'use client'

import * as React from 'react'
import type { PluginPathEntry } from '@/lib/types'

const FORMATS = ['vst3', 'au', 'vst2'] as const
const BLANK: PluginPathEntry = { path: '', format: 'vst3', version: '' }

interface PluginPathsEditorProps {
  value: PluginPathEntry[]
  onChange: (entries: PluginPathEntry[]) => void
  readOnly?: boolean
}

export function PluginPathsEditor({ value, onChange, readOnly = false }: Readonly<PluginPathsEditorProps>) {
  const nextKey = React.useRef(0)
  const [keys, setKeys] = React.useState<readonly number[]>(() =>
    Array.from({ length: value.length }, () => nextKey.current++)
  )

  // Sync keys when value length changes externally (e.g. form reset)
  React.useEffect(() => {
    setKeys(prev => {
      if (prev.length === value.length) return prev
      return Array.from({ length: value.length }, (_, i) =>
        i < prev.length ? prev[i] : nextKey.current++
      )
    })
  }, [value.length])

  function update(index: number, field: keyof PluginPathEntry, next: string) {
    onChange(value.map((e, i) => i === index ? { ...e, [field]: next } : e))
  }

  function remove(index: number) {
    setKeys(k => k.filter((_, i) => i !== index))
    onChange(value.filter((_, i) => i !== index))
  }

  function add() {
    setKeys(k => [...k, nextKey.current++])
    onChange([...value, { ...BLANK }])
  }

  return (
    <div className="space-y-2">
      {value.map((entry, i) => (
        <div key={keys[i]} className="flex gap-2 items-center" data-testid={`plugin-paths-entry-${i}`}>
          <input
            type="text"
            value={entry.path}
            onChange={(e) => update(i, 'path', e.target.value)}
            placeholder="Disk path"
            readOnly={readOnly}
            className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 text-sm"
            data-testid={`plugin-paths-path-${i}`}
          />
          <select
            value={entry.format}
            onChange={(e) => update(i, 'format', e.target.value)}
            disabled={readOnly}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
            data-testid={`plugin-paths-format-${i}`}
          >
            {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <input
            type="text"
            value={entry.version}
            onChange={(e) => update(i, 'version', e.target.value)}
            placeholder="Version"
            readOnly={readOnly}
            className="w-24 rounded border border-border bg-background px-2 py-1 text-sm"
            data-testid={`plugin-paths-version-${i}`}
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              aria-label={`Remove path ${i}`}
              data-testid={`plugin-paths-remove-${i}`}
            >
              Remove
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={add}
          className="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted"
          data-testid="plugin-paths-add"
        >
          Add path
        </button>
      )}
    </div>
  )
}
