'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { NameRuleInput, PatternRuleInput, RuleCreationResult, RuleType, VendorRuleInput } from '@/lib/types'

interface Props {
  readonly ruleType: RuleType
  readonly onSubmit: (input: VendorRuleInput | NameRuleInput | PatternRuleInput) => Promise<RuleCreationResult>
  readonly onClose: () => void
}

export function RuleCreationForm({ ruleType, onSubmit, onClose }: Props) {
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [diskVendor, setDiskVendor] = React.useState('')
  const [catalogVendor, setCatalogVendor] = React.useState('')
  const [diskName, setDiskName] = React.useState('')
  const [catalogName, setCatalogName] = React.useState('')
  const [label, setLabel] = React.useState('')
  const [pattern, setPattern] = React.useState('')
  const [matchVendor, setMatchVendor] = React.useState(false)
  const [matchVersion, setMatchVersion] = React.useState(false)
  const [matchFormat, setMatchFormat] = React.useState(false)
  const [action, setAction] = React.useState('alias_to_match')
  const [enabled, setEnabled] = React.useState(false)

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      let input: VendorRuleInput | NameRuleInput | PatternRuleInput
      if (ruleType === 'vendor') {
        input = { disk_vendor: diskVendor, catalog_vendor: catalogVendor }
      } else if (ruleType === 'name') {
        input = { disk_name: diskName, catalog_name: catalogName }
      } else {
        input = {
          label, pattern,
          match_fields: [matchVendor && 'vendor', matchVersion && 'version', matchFormat && 'format'].filter(Boolean) as string[],
          action, enabled,
        }
      }
      await onSubmit(input)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {ruleType === 'vendor' && (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="disk-vendor">Disk Vendor</Label>
            <Input id="disk-vendor" data-testid="input-disk-vendor" value={diskVendor} onChange={e => setDiskVendor(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="catalog-vendor">Catalog Vendor</Label>
            <Input id="catalog-vendor" data-testid="input-catalog-vendor" value={catalogVendor} onChange={e => setCatalogVendor(e.target.value)} required />
          </div>
        </>
      )}

      {ruleType === 'name' && (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="disk-name">Disk Name</Label>
            <Input id="disk-name" data-testid="input-disk-name" value={diskName} onChange={e => setDiskName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="catalog-name">Catalog Name</Label>
            <Input id="catalog-name" data-testid="input-catalog-name" value={catalogName} onChange={e => setCatalogName(e.target.value)} required />
          </div>
        </>
      )}

      {ruleType === 'pattern' && (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="label">Label</Label>
            <Input id="label" data-testid="input-label" value={label} onChange={e => setLabel(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pattern">Pattern</Label>
            <Input id="pattern" data-testid="input-pattern" value={pattern} onChange={e => setPattern(e.target.value)} required />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Match Fields</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" data-testid="checkbox-match-vendor" checked={matchVendor} onChange={e => setMatchVendor(e.target.checked)} />
              <span>Vendor</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" data-testid="checkbox-match-version" checked={matchVersion} onChange={e => setMatchVersion(e.target.checked)} />
              <span>Version</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" data-testid="checkbox-match-format" checked={matchFormat} onChange={e => setMatchFormat(e.target.checked)} />
              <span>Format</span>
            </label>
          </fieldset>
          <div className="flex flex-col gap-1">
            <Label htmlFor="action">Action</Label>
            <select id="action" data-testid="select-action" value={action} onChange={e => setAction(e.target.value)} className="border rounded px-2 py-1 text-sm">
              <option value="alias_to_match">Alias to match</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" data-testid="toggle-enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            <span>Enabled</span>
          </label>
        </>
      )}

      {error && <p data-testid="rule-form-error" className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" data-testid="rule-form-submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save Rule'}
        </Button>
      </div>
    </form>
  )
}
