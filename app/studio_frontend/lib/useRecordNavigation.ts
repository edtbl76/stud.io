'use client'

import * as React from 'react'

export interface RecordNavigationValue {
  index: number    // 0-based position within data
  total: number    // number of records in the loaded data array
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}

interface UseRecordNavigationOptions<T> {
  data: T[]
  currentRecord: T | null
  getRecordId: (r: T) => string
  onNavigate: (r: T) => void
}

// Returns navigation state and callbacks for stepping through a data array.
// Returns null when no record is open (currentRecord is null) or when the
// current record is not found in data (e.g. newly created record).
export function useRecordNavigation<T>({
  data,
  currentRecord,
  getRecordId,
  onNavigate,
}: UseRecordNavigationOptions<T>): RecordNavigationValue | null {
  const index = React.useMemo(() => {
    if (currentRecord === null) return -1
    const id = getRecordId(currentRecord)
    return data.findIndex((r) => getRecordId(r) === id)
  }, [data, currentRecord, getRecordId])

  const onPrev = React.useCallback(() => {
    if (index > 0) onNavigate(data[index - 1])
  }, [data, index, onNavigate])

  const onNext = React.useCallback(() => {
    if (index >= 0 && index < data.length - 1) onNavigate(data[index + 1])
  }, [data, index, onNavigate])

  if (currentRecord === null || index === -1) return null

  return {
    index,
    total: data.length,
    hasPrev: index > 0,
    hasNext: index < data.length - 1,
    onPrev,
    onNext,
  }
}
