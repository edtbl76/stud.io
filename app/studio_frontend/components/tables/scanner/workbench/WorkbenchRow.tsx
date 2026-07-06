'use client'

import type { NeedsReviewSubState, WorkbenchBucket, WorkbenchRow as WorkbenchRowType } from '@/lib/types'
import { BucketTag } from './BucketTag'

interface RowActionHandlers {
  onReject?: () => void
  onFindLink?: () => void
  onCreateRecord?: () => void
  onExclude?: () => void
  onResolveCollision?: () => void
}

interface WorkbenchRowProps extends RowActionHandlers {
  row: WorkbenchRowType
  isSelected: boolean
  subState?: NeedsReviewSubState
  onToggleSelect: (id: string) => void
  onShiftSelect: (id: string) => void
  onRowClick: (row: WorkbenchRowType) => void
}

function RowTag({ bucket, subState }: Readonly<{ bucket: WorkbenchBucket; subState?: NeedsReviewSubState }>) {
  if (bucket === 'collision') return <BucketTag bucket={bucket} />
  if (bucket === 'orphaned') return <BucketTag bucket={bucket} />
  if (bucket === 'needs_review' && subState) return <BucketTag bucket={bucket} subState={subState} />
  return null
}

function FieldDiff({ disk, catalog, showDiff, className }: Readonly<{
  disk: string; catalog: string | null; showDiff: boolean; className?: string
}>) {
  const differs = showDiff && catalog != null && catalog !== '' && disk !== catalog
  if (!differs) return <span className={className}>{disk}</span>
  return (
    <span className={className} title={`${disk} → ${catalog}`}>
      <span className="text-muted-foreground">{disk}</span>
      <span aria-hidden> → </span>
      <span>{catalog}</span>
    </span>
  )
}

function RowActions({ bucket, onReject, onFindLink, onCreateRecord, onExclude, onResolveCollision }: Readonly<{ bucket: WorkbenchBucket } & RowActionHandlers>) {
  return (
    <div className="flex items-center gap-1 ml-auto">
      {bucket === 'unlinked' && (
        <>
          <button type="button" onClick={onFindLink}>Find Link</button>
          <button type="button" onClick={onCreateRecord}>Create Record</button>
          <button type="button" onClick={onExclude}>Exclude</button>
        </>
      )}
      {bucket === 'orphaned' && <button type="button" onClick={onFindLink}>Find Link</button>}
      {(bucket === 'needs_review' || bucket === 'known') && <button type="button" onClick={onReject}>Reject</button>}
      {bucket === 'collision' && <button type="button" onClick={onResolveCollision}>Resolve</button>}
    </div>
  )
}

export function WorkbenchRow({ row, isSelected, subState, onToggleSelect, onShiftSelect, onRowClick, onReject, onFindLink, onCreateRecord, onExclude, onResolveCollision }: Readonly<WorkbenchRowProps>) {
  const {
    bucket, result_id, display_name, disk_name, display_vendor, disk_version, disk_format,
    catalog_record_name, catalog_record_vendor, catalog_record_version,
  } = row
  const shouldDiff = bucket === 'needs_review' || bucket === 'collision'

  function handleCheckboxClick(e: React.MouseEvent<HTMLInputElement>) {
    if (e.shiftKey) {
      onShiftSelect(result_id)
    } else {
      onToggleSelect(result_id)
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
      <input
        type="checkbox"
        checked={isSelected}
        onClick={handleCheckboxClick}
        onChange={() => undefined}
        className="shrink-0"
      />

      <button
        type="button"
        className="flex flex-1 items-center gap-3 text-left min-w-0"
        onClick={() => onRowClick(row)}
      >
        {shouldDiff && catalog_record_name != null && catalog_record_name !== display_name ? (
          <FieldDiff disk={display_name} catalog={catalog_record_name} showDiff className="flex-1 truncate text-sm" />
        ) : (
          <span
            title={display_name === disk_name ? undefined : disk_name}
            className="flex-1 truncate text-sm"
          >
            {display_name}
          </span>
        )}
        <RowTag bucket={bucket} subState={subState} />
        <FieldDiff disk={display_vendor} catalog={catalog_record_vendor} showDiff={shouldDiff} className="text-sm text-muted-foreground w-44 truncate" />
        <FieldDiff disk={disk_version} catalog={catalog_record_version} showDiff={shouldDiff} className="text-sm text-muted-foreground w-28 truncate" />
        <span className="text-sm text-muted-foreground w-12">{disk_format}</span>
      </button>

      <RowActions
        bucket={bucket}
        onReject={onReject}
        onFindLink={onFindLink}
        onCreateRecord={onCreateRecord}
        onExclude={onExclude}
        onResolveCollision={onResolveCollision}
      />
    </div>
  )
}
