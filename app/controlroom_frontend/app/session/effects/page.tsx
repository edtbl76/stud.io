'use client'

import { TablePage } from '@/components/TablePage'
import { effectColumns } from '@/components/tables/effects/columns'
import { EffectModal } from '@/components/tables/effects/EffectModal'
import { Effect } from '@/lib/types'

export default function EffectsPage() {
  return (
    <TablePage<Effect>
      title="Effects"
      endpoint="/effects"
      queryKey="/session/effects"
      columns={effectColumns}
      getRowId={(row) => row.effect_id}
      renderModal={(record, onClose, onMutate) => (
        <EffectModal record={record} onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
