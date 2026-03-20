'use client'

import { TablePage } from '@/components/TablePage'
import { libraryColumns, libraryBulkEditFields } from '@/components/tables/libraries/columns'
import { LibraryModal } from '@/components/tables/libraries/LibraryModal'
import { Library } from '@/lib/types'

export default function LibrariesPage() {
  return (
    <TablePage<Library>
      title="Libraries"
      endpoint="/libraries"
      queryKey="/session/libraries"
      columns={libraryColumns}
      bulkEditFields={libraryBulkEditFields}
      getRowId={(row) => row.library_id}
      renderModal={(record, onClose, onMutate) => (
        <LibraryModal record={record} onClose={onClose} onMutate={onMutate} />
      )}
      paginated
    />
  )
}
