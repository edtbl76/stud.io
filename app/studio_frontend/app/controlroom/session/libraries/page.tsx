'use client'

import dynamic from 'next/dynamic'
import { TablePage } from '@/components/TablePage'
import { libraryColumns, libraryBulkEditFields, librarySortFields } from '@/components/tables/libraries/columns'
import type { Library } from '@/lib/types'

const LibraryModal = dynamic(
  () => import('@/components/tables/libraries/LibraryModal').then(m => m.LibraryModal),
  { ssr: false, loading: () => null }
)

export default function LibrariesPage() {
  return (
    <TablePage<Library>
      title="Libraries"
      endpoint="/studio/session/libraries"
      queryKey="/session/libraries"
      columns={libraryColumns}
      bulkEditFields={libraryBulkEditFields}
      sortFields={librarySortFields}
      getRowId={(row) => row.library_id}
      renderModal={(record, onClose, onMutate) => (
        <LibraryModal record={record} onClose={onClose} onMutate={onMutate} />
      )}
      paginated
    />
  )
}
