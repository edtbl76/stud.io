'use client'

import { TablePage } from '@/components/TablePage'
import { toolColumns, toolBulkEditFields } from '@/components/tables/tools/columns'
import { ToolModal } from '@/components/tables/tools/ToolModal'
import { Tool } from '@/lib/types'

export default function AdminToolsPage() {
  return (
    <TablePage<Tool>
      title="Admin Tools"
      endpoint="/tools/admin"
      queryKey="/tools/admin"
      columns={toolColumns}
      bulkEditFields={toolBulkEditFields}
      getRowId={(row) => row.tool_id}
      renderModal={(record, onClose, onMutate) => (
        <ToolModal record={record} category="admin" onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
