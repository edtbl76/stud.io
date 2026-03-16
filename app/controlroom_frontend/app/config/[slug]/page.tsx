'use client'

import { TablePage } from '@/components/TablePage'
import { configColumns } from '@/components/tables/config/columns'
import { ConfigModal } from '@/components/tables/config/ConfigModal'
import { LookupOut } from '@/lib/types'
import { formatSlug } from '@/lib/utils'

interface ConfigPageProps {
  params: { slug: string }
}

export default function ConfigPage({ params }: ConfigPageProps) {
  const { slug } = params
  const title = formatSlug(slug)
  const endpoint = `/config/${slug}`

  return (
    <TablePage<LookupOut>
      title={title}
      endpoint={endpoint}
      queryKey={endpoint}
      columns={configColumns}
      getRowId={(row) => row.type_id}
      renderModal={(record, onClose, onMutate) => (
        <ConfigModal record={record} slug={slug} onClose={onClose} onMutate={onMutate} />
      )}
    />
  )
}
