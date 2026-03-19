'use client'

import { TablePage } from '@/components/TablePage'
import { toolColumns, toolBulkEditFields } from '@/components/tables/tools/columns'
import { ToolModal } from '@/components/tables/tools/ToolModal'
import { Tool } from '@/lib/types'

export default function CompositionToolsPage() {
  return (
    <TablePage<Tool>
      title="Composition Tools"
      endpoint="/tools/composition"
      queryKey="/tools/composition"
      columns={toolColumns}
      bulkEditFields={toolBulkEditFields}
      getRowId={(row) => row.tool_id}
      renderModal={(record, onClose, onMutate) => (
        <ToolModal record={record} category="composition" onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
