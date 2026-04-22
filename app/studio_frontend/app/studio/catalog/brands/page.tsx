'use client'

import { TablePage } from '@/components/TablePage'
import { brandColumns, brandBulkEditFields, brandSortFields } from '@/components/tables/brands/columns'
import { BrandModal } from '@/components/tables/brands/BrandModal'
import { Brand } from '@/lib/types'

export default function BrandsPage() {
  return (
    <TablePage<Brand>
      title="Brands"
      endpoint="/brands"
      queryKey="/catalog/brands"
      columns={brandColumns}
      getRowId={(row) => row.brand_id}
      bulkEditFields={brandBulkEditFields}
      sortFields={brandSortFields}
      paginated
      renderModal={(record, onClose, onMutate) => (
        <BrandModal record={record} onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
