'use client'

import { TablePage } from '@/components/TablePage'
import { toolColumns, toolBulkEditFields, toolSortFields } from '@/components/tables/tools/columns'
import { ToolModal } from '@/components/tables/tools/ToolModal'
import { Tool } from '@/lib/types'

export default function CompositionToolsPage() {
  return (
    <TablePage<Tool>
      title="Composition Tools"
      endpoint="/studio/tools/composition"
      queryKey="/tools/composition"
      columns={toolColumns}
      bulkEditFields={toolBulkEditFields}
      sortFields={toolSortFields}
      paginated
      getRowId={(row) => row.tool_id}
      renderModal={(record, onClose, onMutate) => (
        <ToolModal record={record} category="composition" onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
