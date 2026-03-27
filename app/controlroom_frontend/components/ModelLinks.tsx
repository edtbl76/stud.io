'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { ModelModal } from '@/components/tables/models/ModelModal'
import { api } from '@/lib/api'
import type { Model, ModelRef } from '@/lib/types'

interface ModelLinksProps {
  models: ModelRef[] | null | undefined
}

export function ModelLinks({ models }: Readonly<ModelLinksProps>) {
  const [selectedModel, setSelectedModel] = React.useState<Model | undefined>(undefined)

  if (!models || models.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }

  async function handleClick(id: string) {
    try {
      const model = await api.get<Model>('/models', id)
      setSelectedModel(model)
    } catch {
      // model fetch failed — do nothing
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-1">
        {models.map(m => (
          <Badge
            key={m.id}
            variant="secondary"
            className="cursor-pointer hover:bg-primary/20 transition-colors"
            onClick={() => void handleClick(m.id)}
          >
            {m.name}
          </Badge>
        ))}
      </div>
      {selectedModel !== undefined && (
        <ModelModal
          record={selectedModel}
          onClose={() => setSelectedModel(undefined)}
          onMutate={() => {}}
        />
      )}
    </>
  )
}
