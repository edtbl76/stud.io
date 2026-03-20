'use client'

import { TablePage } from '@/components/TablePage'
import { modelColumns, modelBulkEditFields } from '@/components/tables/models/columns'
import { ModelModal } from '@/components/tables/models/ModelModal'
import { Model } from '@/lib/types'

export default function ModelsPage() {
  return (
    <TablePage<Model>
      title="Models"
      endpoint="/models"
      queryKey="/catalog/models"
      columns={modelColumns}
      bulkEditFields={modelBulkEditFields}
      getRowId={(row) => row.model_id}
      renderModal={(record, onClose, onMutate) => (
        <ModelModal record={record} onClose={onClose} onMutate={onMutate} />
      )}
      paginated
    />
  )
}
