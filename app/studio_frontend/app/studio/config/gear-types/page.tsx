'use client'

import { TablePage } from '@/components/TablePage'
import { configColumns, configSortFields } from '@/components/tables/config/columns'
import { ConfigModal } from '@/components/tables/config/ConfigModal'
import { LookupOut } from '@/lib/types'

const ENDPOINT = '/gearlist/gear-types'

export default function GearTypesPage() {
  return (
    <TablePage<LookupOut>
      title="Gear Types"
      endpoint={ENDPOINT}
      queryKey={ENDPOINT}
      columns={configColumns}
      sortFields={configSortFields}
      getRowId={(row) => row.type_id}
      renderModal={(record, onClose, onMutate) => (
        <ConfigModal record={record} slug="gear-types" endpoint={ENDPOINT} onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
