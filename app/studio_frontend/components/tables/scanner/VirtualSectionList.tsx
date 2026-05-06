'use client'

import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

interface VirtualSectionListProps<T> {
  items: T[]
  estimatedItemHeight: number
  renderItem: (item: T, index: number) => React.ReactNode
  emptyState: React.ReactNode
}

export function VirtualSectionList<T>({
  items,
  estimatedItemHeight,
  renderItem,
  emptyState,
}: Readonly<VirtualSectionListProps<T>>) {
  const parentRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedItemHeight,
    overscan: 5,
  })

  if (items.length === 0) return <>{emptyState}</>

  return (
    <div ref={parentRef} className="h-full overflow-auto" data-testid="virtual-section-list">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vItem) => (
          <div
            key={vItem.key}
            ref={virtualizer.measureElement}
            data-index={vItem.index}
            style={{ position: 'absolute', top: vItem.start, left: 0, right: 0 }}
          >
            {renderItem(items[vItem.index], vItem.index)}
          </div>
        ))}
      </div>
    </div>
  )
}
