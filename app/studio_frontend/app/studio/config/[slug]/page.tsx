'use client'

import { useParams } from 'next/navigation'
import { TablePage } from '@/components/TablePage'
import { configColumns, configSortFields } from '@/components/tables/config/columns'
import { ConfigModal } from '@/components/tables/config/ConfigModal'
import { LookupOut } from '@/lib/types'
import { formatSlug } from '@/lib/utils'

export default function ConfigPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const title = formatSlug(slug)
  const endpoint = `/config/${slug}`

  return (
    <TablePage<LookupOut>
      title={title}
      endpoint={endpoint}
      queryKey={endpoint}
      columns={configColumns}
      sortFields={configSortFields}
      getRowId={(row) => row.type_id}
      renderModal={(record, onClose, onMutate) => (
        <ConfigModal record={record} slug={slug} onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
