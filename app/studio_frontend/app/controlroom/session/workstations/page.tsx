'use client'

import { TablePage } from '@/components/TablePage'
import { workstationColumns, workstationBulkEditFields, workstationSortFields } from '@/components/tables/workstations/columns'
import { WorkstationModal } from '@/components/tables/workstations/WorkstationModal'
import { Workstation } from '@/lib/types'

export default function WorkstationsPage() {
  return (
    <TablePage<Workstation>
      title="Workstations"
      endpoint="/studio/session/workstations"
      queryKey="/session/workstations"
      columns={workstationColumns}
      bulkEditFields={workstationBulkEditFields}
      sortFields={workstationSortFields}
      paginated
      getRowId={(row) => row.workstation_id}
      renderModal={(record, onClose, onMutate) => (
        <WorkstationModal record={record} onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
