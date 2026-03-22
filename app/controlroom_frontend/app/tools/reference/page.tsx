'use client'

import { TablePage } from '@/components/TablePage'
import { toolColumns, toolBulkEditFields, toolSortFields } from '@/components/tables/tools/columns'
import { ToolModal } from '@/components/tables/tools/ToolModal'
import { Tool } from '@/lib/types'

export default function ReferenceToolsPage() {
  return (
    <TablePage<Tool>
      title="Reference Tools"
      endpoint="/tools/reference"
      queryKey="/tools/reference"
      columns={toolColumns}
      bulkEditFields={toolBulkEditFields}
      sortFields={toolSortFields}
      getRowId={(row) => row.tool_id}
      renderModal={(record, onClose, onMutate) => (
        <ToolModal record={record} category="reference" onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
