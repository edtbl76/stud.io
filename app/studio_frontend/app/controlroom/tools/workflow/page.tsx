'use client'

import { TablePage } from '@/components/TablePage'
import { toolColumns, toolBulkEditFields, toolSortFields } from '@/components/tables/tools/columns'
import { ToolModal } from '@/components/tables/tools/ToolModal'
import { Tool } from '@/lib/types'

export default function WorkflowToolsPage() {
  return (
    <TablePage<Tool>
      title="Workflow Tools"
      endpoint="/studio/tools/workflow"
      queryKey="/tools/workflow"
      columns={toolColumns}
      bulkEditFields={toolBulkEditFields}
      sortFields={toolSortFields}
      paginated
      getRowId={(row) => row.tool_id}
      renderModal={(record, onClose, onMutate) => (
        <ToolModal record={record} category="workflow" onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
