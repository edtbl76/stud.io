'use client'

import type { NeedsReviewSubState, WorkbenchBucket } from '@/lib/types'

const BUCKET_LABELS: Record<WorkbenchBucket, string> = {
  unlinked: 'Unlinked',
  orphaned: 'Orphaned',
  needs_review: 'Needs Review',
  known: 'Known',
  excluded: 'Excluded',
  collision: 'Collision',
}

interface BucketTagProps {
  bucket: WorkbenchBucket
  subState?: NeedsReviewSubState
}

export function BucketTag({ bucket, subState }: Readonly<BucketTagProps>) {
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span
        data-testid="bucket-tag-pill-primary"
        className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium"
      >
        {BUCKET_LABELS[bucket]}
      </span>
      {subState && (
        <span
          data-testid="bucket-tag-pill-sub"
          className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground"
        >
          {subState}
        </span>
      )}
    </span>
  )
}
