'use client'

import { TablePage } from '@/components/TablePage'
import { workstationColumns } from '@/components/tables/workstations/columns'
import { WorkstationModal } from '@/components/tables/workstations/WorkstationModal'
import { Workstation } from '@/lib/types'

export default function WorkstationsPage() {
  return (
    <TablePage<Workstation>
      title="Workstations"
      endpoint="/workstations"
      queryKey="/session/workstations"
      columns={workstationColumns}
      getRowId={(row) => row.workstation_id}
      renderModal={(record, onClose, onMutate) => (
        <WorkstationModal record={record} onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
