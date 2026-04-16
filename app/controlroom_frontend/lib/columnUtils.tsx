'use client'

import * as React from 'react'

/** Renders an optional text value with muted styling, or a dash placeholder if null/empty. */
export function renderMutedText(val: string | null | undefined): React.ReactElement {
  return val
    ? <span className="text-muted-foreground text-xs">{val}</span>
    : <span className="text-muted-foreground/40">—</span>
}
