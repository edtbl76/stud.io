'use client'

import { TablePage } from '@/components/TablePage'
import { gearColumns, gearSortFields } from '@/components/tables/gear/columns'
import { GearModal } from '@/components/tables/gear/GearModal'
import { Gear } from '@/lib/types'

export default function OtherGearPage() {
  return (
    <TablePage<Gear>
      title="Other Gear"
      endpoint="/gearlist/gear"
      queryKey="/gearlist/other-gear"
      columns={gearColumns}
      sortFields={gearSortFields}
      getRowId={(row) => row.gear_id}
      renderModal={(record, onClose, onMutate) => (
        <GearModal record={record} onClose={onClose} onMutate={onMutate} />
      )}
      paginated
    />
  )
}
