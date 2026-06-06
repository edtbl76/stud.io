'use client'

import { NativeSelect } from '@/components/ui/NativeSelect'
import type { NeedsReviewSubState, WorkbenchBucket, WorkbenchClientFilters } from '@/lib/types'

const BUCKET_OPTIONS: Array<{ value: WorkbenchBucket | ''; label: string }> = [
  { value: '', label: 'All Buckets' },
  { value: 'unlinked', label: 'Unlinked' },
  { value: 'orphaned', label: 'Orphaned' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'known', label: 'Known' },
  { value: 'excluded', label: 'Excluded' },
]

const SUB_STATE_OPTIONS: Array<{ value: NeedsReviewSubState | ''; label: string }> = [
  { value: '', label: 'All Sub-states' },
  { value: 'mismatch', label: 'Mismatch' },
  { value: 'unconfirmed', label: 'Unconfirmed' },
  { value: 'collision', label: 'Collision' },
]

const CATALOG_TYPE_OPTIONS = [
  { value: '', label: 'All Catalog Types' },
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

const FORMAT_OPTIONS = [
  { value: '', label: 'All Formats' },
  { value: 'vst3', label: 'VST3' },
  { value: 'au', label: 'AU' },
  { value: 'vst2', label: 'VST2' },
]

const BLANK_FILTERS: WorkbenchClientFilters = {
  bucket: '',
  needs_review_substate: '',
  catalog_type: '',
  format: '',
}

interface WorkbenchFilterBarProps {
  filters: WorkbenchClientFilters
  onFiltersChange: (patch: Partial<WorkbenchClientFilters>) => void
}

export function WorkbenchFilterBar({ filters, onFiltersChange }: Readonly<WorkbenchFilterBarProps>) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <NativeSelect
        aria-label="Catalog Type"
        value={filters.catalog_type}
        onChange={(e) => onFiltersChange({ catalog_type: e.target.value })}
      >
        {CATALOG_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </NativeSelect>

      <NativeSelect
        aria-label="Bucket"
        value={filters.bucket}
        onChange={(e) => onFiltersChange({ bucket: e.target.value as WorkbenchBucket | '' })}
      >
        {BUCKET_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </NativeSelect>

      {filters.bucket === 'needs_review' && (
        <NativeSelect
          aria-label="Sub-state"
          value={filters.needs_review_substate}
          onChange={(e) => onFiltersChange({ needs_review_substate: e.target.value as NeedsReviewSubState | '' })}
        >
          {SUB_STATE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </NativeSelect>
      )}

      <NativeSelect
        aria-label="Format"
        value={filters.format}
        onChange={(e) => onFiltersChange({ format: e.target.value })}
      >
        {FORMAT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </NativeSelect>

      <button
        type="button"
        aria-label="Reset filters"
        onClick={() => onFiltersChange(BLANK_FILTERS)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 border border-border rounded"
      >
        Reset
      </button>
    </div>
  )
}
