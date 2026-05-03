'use client'

import { TablePage } from '@/components/TablePage'
import { guitarColumns, guitarSortFields } from '@/components/tables/gear/guitarColumns'
import { GearModal } from '@/components/tables/gear/GearModal'
import { Gear } from '@/lib/types'
import { GUITAR_TYPE_ID } from '@/lib/gearlist'

export default function GuitarsPage() {
  return (
    <TablePage<Gear>
      title="Guitars"
      endpoint={`/gearlist/gear?type_id=${GUITAR_TYPE_ID}`}
      queryKey="/gearlist/guitars"
      columns={guitarColumns}
      sortFields={guitarSortFields}
      getRowId={(row) => row.gear_id}
      renderModal={(record, onClose, onMutate) => (
        <GearModal record={record} onClose={onClose} onMutate={onMutate} />
      )}
      paginated
    />
  )
}
