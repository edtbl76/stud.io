'use client'

import { TablePage } from '@/components/TablePage'
import { guitarColumns, guitarSortFields } from '@/components/tables/gear/guitarColumns'
import { GearModal } from '@/components/tables/gear/GearModal'
import { Gear } from '@/lib/types'

const GUITAR_TYPE_ID = 'a1b2c3d4-0001-0000-0000-000000000001'

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
