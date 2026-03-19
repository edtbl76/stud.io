'use client'

import { TablePage } from '@/components/TablePage'
import { toolColumns, toolBulkEditFields } from '@/components/tables/tools/columns'
import { ToolModal } from '@/components/tables/tools/ToolModal'
import { Tool } from '@/lib/types'

export default function MeasurementToolsPage() {
  return (
    <TablePage<Tool>
      title="Measurement Tools"
      endpoint="/tools/measurement"
      queryKey="/tools/measurement"
      columns={toolColumns}
      bulkEditFields={toolBulkEditFields}
      getRowId={(row) => row.tool_id}
      renderModal={(record, onClose, onMutate) => (
        <ToolModal record={record} category="measurement" onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
