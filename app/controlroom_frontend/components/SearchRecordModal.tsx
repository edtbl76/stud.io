'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RecordModalLeadingAction } from '@/components/RecordModal'
import { api } from '@/lib/api'
import { SEARCH_TABLE_META } from '@/lib/searchMeta'
import type {
  Brand, Model, Effect, Instrument, Library, Workstation, Tool, SearchResult,
} from '@/lib/types'
import { BrandModal } from '@/components/tables/brands/BrandModal'
import { ModelModal } from '@/components/tables/models/ModelModal'
import { EffectModal } from '@/components/tables/effects/EffectModal'
import { InstrumentModal } from '@/components/tables/instruments/InstrumentModal'
import { LibraryModal } from '@/components/tables/libraries/LibraryModal'
import { WorkstationModal } from '@/components/tables/workstations/WorkstationModal'
import { ToolModal } from '@/components/tables/tools/ToolModal'

type ModalRenderer = (record: unknown, onClose: () => void, onMutate: () => void) => React.ReactNode

// Casts are safe: the API guarantees the returned record matches the table key.
const MODAL_REGISTRY: Record<string, ModalRenderer> = {
  brands:            (r, c, m) => <BrandModal      record={r as Brand}       onClose={c} onMutate={m} />,
  models:            (r, c, m) => <ModelModal       record={r as Model}       onClose={c} onMutate={m} />,
  effects:           (r, c, m) => <EffectModal      record={r as Effect}      onClose={c} onMutate={m} />,
  instruments:       (r, c, m) => <InstrumentModal  record={r as Instrument}  onClose={c} onMutate={m} />,
  libraries:         (r, c, m) => <LibraryModal     record={r as Library}     onClose={c} onMutate={m} />,
  workstations:      (r, c, m) => <WorkstationModal record={r as Workstation} onClose={c} onMutate={m} />,
  workflow_tools:    (r, c, m) => <ToolModal record={r as Tool} category="workflow"    onClose={c} onMutate={m} />,
  measurement_tools: (r, c, m) => <ToolModal record={r as Tool} category="measurement" onClose={c} onMutate={m} />,
  reference_tools:   (r, c, m) => <ToolModal record={r as Tool} category="reference"   onClose={c} onMutate={m} />,
  composition_tools: (r, c, m) => <ToolModal record={r as Tool} category="composition" onClose={c} onMutate={m} />,
  admin_tools:       (r, c, m) => <ToolModal record={r as Tool} category="admin"        onClose={c} onMutate={m} />,
}

interface SearchRecordModalProps {
  result: SearchResult
  onClose: () => void
  onMutate: () => void
}

function SearchRecordSkeleton({ onClose }: Readonly<{ onClose: () => void }>): React.ReactElement {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SearchRecordModal({ result, onClose, onMutate }: Readonly<SearchRecordModalProps>): React.ReactElement | null {
  const router = useRouter()
  const meta = SEARCH_TABLE_META[result.table]
  const renderModal = MODAL_REGISTRY[result.table]

  const { data: record, isLoading, isError } = useQuery({
    queryKey: ['search-record', result.table, result.id],
    queryFn: () => api.get<unknown>(meta.endpoint, result.id),
    enabled: !!meta && !!renderModal,
  })

  // Close automatically if the fetch fails — keeps the user in the search results
  React.useEffect(() => {
    if (isError) onClose()
  }, [isError, onClose])

  const handleNavigate = React.useCallback(() => {
    onClose()
    router.push(`${meta?.path}?open=${result.id}`)
  }, [onClose, router, meta, result.id])

  const goToButton = React.useMemo(() => (
    <Button variant="outline" size="sm" onClick={handleNavigate}>
      Go to {meta?.label}
    </Button>
  ), [handleNavigate, meta])

  if (!meta || !renderModal) return null
  if (isLoading || !record) return <SearchRecordSkeleton onClose={onClose} />

  return (
    <RecordModalLeadingAction.Provider value={goToButton}>
      {renderModal(record, onClose, onMutate)}
    </RecordModalLeadingAction.Provider>
  )
}
