'use client'

import { TablePage } from '@/components/TablePage'
import { instrumentColumns } from '@/components/tables/instruments/columns'
import { InstrumentModal } from '@/components/tables/instruments/InstrumentModal'
import { Instrument } from '@/lib/types'

export default function InstrumentsPage() {
  return (
    <TablePage<Instrument>
      title="Instruments"
      endpoint="/instruments"
      queryKey="/session/instruments"
      columns={instrumentColumns}
      getRowId={(row) => row.instrument_id}
      renderModal={(record, onClose, onMutate) => (
        <InstrumentModal record={record} onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
